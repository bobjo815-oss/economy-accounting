import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSamples } from "./receipt-evaluation.mjs";
import { pollReceipt, retryDelay, submitReceipt } from "./receipt-polling.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(project, "..", "receipts-samples");
const privateRoot = path.resolve(project, "data", "receipt-evaluation");
const answersPath = path.join(privateRoot, "Answers.json");
const apiVersion = "2024-11-30";
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emptyReceipt = () => Object.fromEntries(["merchant", "date", "total", "currency"].map((field) => [field, { state: "unreviewed", value: null }]));

async function prepare() {
  const files = (await readdir(source)).filter((name) => /\.(jpe?g|png)$/i.test(name)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const samples = [];
  for (const file of files) {
    const buffer = await readFile(path.join(source, file));
    samples.push({ file, sha256: sha256(buffer), bytes: buffer.length, reviewedBy: "", reviewedAt: null, receiptCount: null, receipts: [emptyReceipt()], fullText: null, documentIndices: null, mappingReviewedBy: "", manualEntrySeconds: null, correctionSeconds: null });
  }
  await mkdir(privateRoot, { recursive: true });
  await writeFile(answersPath, JSON.stringify({ rubricVersion: 1, instructions: "Review the source image before seeing predictions. Fill receiptCount and one answer per receipt. Each core field uses visible (value required), absent, or unreadable (value null). Set reviewedBy and reviewedAt only after human review. ISO dates; decimal totals without separators; GBP/KRW/USD. Merchant aliases must be source-verified. Optional fullText measures OCR separately. Multiple receipts require documentIndices and mappingReviewedBy after association by source location, never by matching values. Record manualEntrySeconds and correctionSeconds during separate timed trials.", samples }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ preparedImages: samples.length, humanReviewedImages: 0 }));
}

function extractReceipt(document) {
  const fields = document.fields ?? {};
  const total = fields.Total?.valueCurrency;
  return {
    merchant: fields.MerchantName?.valueString ?? null,
    date: fields.TransactionDate?.valueDate ?? null,
    total: total?.amount === undefined ? (fields.Total?.valueNumber === undefined ? null : String(fields.Total.valueNumber)) : String(total.amount),
    currency: total?.currencyCode ?? null,
    items: (fields.Items?.valueArray ?? []).map((item) => item.valueObject ?? {}),
    evidence: fields, boundingRegions: document.boundingRegions ?? [],
  };
}

async function request(url, options) {
  // Do not leak API keys through redirects or provider errors through logs.
  return fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(60000) });
}

async function run(resumeFilename) {
  const endpointText = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  if (!endpointText || !key) throw new Error("Azure endpoint/key are not configured in the private environment file");
  const endpoint = new URL(endpointText);
  if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.cognitiveservices\.azure\.com$/i.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/") throw new Error("Use the Azure resource HTTPS endpoint");
  const answers = JSON.parse(await readFile(answersPath, "utf8"));
  if (answers.samples.length > 30) throw new Error("Pilot is limited to 30 images");
  const buffers = [];
  for (const sample of answers.samples) {
    if (path.basename(sample.file) !== sample.file) throw new Error("Invalid sample filename");
    const buffer = await readFile(path.join(source, sample.file));
    if (buffer.length > 4 * 1024 * 1024 || sha256(buffer) !== sample.sha256) throw new Error("Source changed or exceeds the free-tier size limit");
    buffers.push(buffer);
  }
  if (resumeFilename && (path.basename(resumeFilename) !== resumeFilename || !/^Predictions-.*\.json$/.test(resumeFilename))) throw new Error("Use a private prediction filename to resume");
  const resultPath = path.join(privateRoot, resumeFilename ?? `Predictions-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const result = resumeFilename ? JSON.parse(await readFile(resultPath, "utf8")) : { provider: "azure", model: "prebuilt-receipt", apiVersion, rubricVersion: 1, startedAt: new Date().toISOString(), samples: [] };
  if (result.provider !== "azure" || result.model !== "prebuilt-receipt" || result.apiVersion !== apiVersion || !Array.isArray(result.samples) || result.samples.length > answers.samples.length || result.samples.some((entry, index) => entry.sha256 !== answers.samples[index].sha256)) throw new Error("Pilot checkpoint does not match this sample set");
  // Explicit run command sends only this named sample set; no ledger access or writes.
  for (const [index, sample] of answers.samples.entries()) {
    const previous = result.samples[index];
    if (previous && !previous.error && previous.state !== "submitting" && typeof previous.text === "string") continue;
    const rejected = previous?.state === "rejected" || previous?.error === "Azure submission failed (HTTP 429)";
    if (previous && !previous.operation && !rejected) throw new Error("Pilot submission state is uncertain; do not resubmit automatically");
    const entry = previous ?? { sha256: sample.sha256, receipts: [], text: null, error: null };
    const started = Date.now();
    try {
      let initialDelay = 3000;
      if (!entry.operation) {
        entry.state = "submitting";
        result.samples[index] = entry;
        await writeFile(resultPath, JSON.stringify(result, null, 2));
        const url = new URL(`/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=${apiVersion}`, endpoint);
        const response = await submitReceipt(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/octet-stream" }, body: buffers[index] }, {
          request, wait: pause,
          onSubmitting: async () => {
            entry.state = "submitting";
            await writeFile(resultPath, JSON.stringify(result, null, 2));
          },
          onRejected: async (delay) => {
            entry.state = "rejected";
            entry.retryAfterMs = delay;
            await writeFile(resultPath, JSON.stringify(result, null, 2));
          },
        });
        if (response.status !== 202) throw new Error(`Azure submission failed (HTTP ${response.status})`);
        const location = response.headers.get("operation-location");
        if (!location) throw new Error("Azure did not return an operation location");
        entry.operation = location;
        initialDelay = retryDelay(response.headers.get("retry-after"), 0);
      }
      const operation = new URL(entry.operation);
      if (operation.origin !== endpoint.origin || operation.username || operation.password || operation.hash || !operation.pathname.startsWith("/documentintelligence/documentModels/prebuilt-receipt/analyzeResults/")) throw new Error("Azure returned an unexpected operation origin");
      entry.state = "polling";
      entry.error = null;
      result.samples[index] = entry;
      await writeFile(resultPath, JSON.stringify(result, null, 2));
      const analysis = await pollReceipt(operation, { request, key, wait: pause, initialDelay });
      entry.receipts = analysis.documents.map(extractReceipt);
      entry.text = analysis.content;
      entry.state = "completed";
    } catch (error) {
      entry.error = error.message?.startsWith("Azure") ? error.message : "Request failed; provider body and private content omitted";
    }
    entry.elapsedMs = (entry.elapsedMs ?? 0) + Date.now() - started;
    result.samples[index] = entry;
    await writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ processed: index + 1, images: answers.samples.length, succeeded: !entry.error, elapsedMs: entry.elapsedMs }));
    if (entry.error) throw new Error("Pilot stopped after a failed request; partial output retained privately");
  }
  console.log(JSON.stringify({ resultFile: path.basename(resultPath) }));
}

async function score(filename) {
  if (!filename || path.basename(filename) !== filename || !/^Predictions-.*\.json$/.test(filename)) throw new Error("Specify a prediction filename from the private evaluation folder");
  const answers = JSON.parse(await readFile(answersPath, "utf8"));
  const results = JSON.parse(await readFile(path.join(privateRoot, filename), "utf8"));
  const summary = evaluateSamples(answers.samples, results.samples);
  await writeFile(path.join(privateRoot, `Metrics-${filename.slice(12)}`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

try {
  const [action, filename] = process.argv.slice(2);
  if (action === "prepare") await prepare();
  else if (action === "run") await run();
  else if (action === "resume" && filename) await run(filename);
  else if (action === "score") await score(filename);
  else throw new Error("Use prepare, run, resume <prediction filename>, or score <prediction filename>");
} catch (error) {
  // Error text is intentionally generic: file contents and provider payloads are private.
  console.error(error.code === "EEXIST" ? "Private answer sheet already exists; it was preserved" : error.code === "ENOENT" ? "Required local file is missing" : error.message?.startsWith("Azure") || error.message?.startsWith("Pilot") || error.message?.startsWith("Use ") ? error.message : "Benchmark input/configuration is invalid; private details omitted");
  process.exitCode = 1;
}
