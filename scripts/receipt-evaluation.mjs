import assert from "node:assert/strict";

const fields = ["merchant", "date", "total", "currency"];
const normalizeName = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function amountUnits(value, currency) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimal = ""] = value.split(".");
  if (currency === "KRW" && /[1-9]/.test(decimal)) return null;
  return currency === "KRW" ? BigInt(whole) : BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}

export function characterDistance(expected, actual) {
  const a = [...expected.normalize("NFC").replace(/\r\n/g, "\n")];
  const b = [...actual.normalize("NFC").replace(/\r\n/g, "\n")];
  assert(a.length * b.length <= 25_000_000, "Transcript is too large for this small pilot");
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) {
      current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j])));
    }
    previous = current;
  }
  return { edits: previous[b.length], characters: a.length };
}

export function validateAnswer(sample) {
  assert(Number.isInteger(sample.receiptCount) && sample.receiptCount >= 0, "Review the receipt count");
  assert(sample.receipts.length === sample.receiptCount, "One answer is required per receipt");
  for (const receipt of sample.receipts) {
    for (const field of fields) {
      const answer = receipt[field];
      assert(answer && ["visible", "absent", "unreadable", "unreviewed"].includes(answer.state), "Use an explicit review state");
      if (answer.state !== "visible") {
        assert(answer.value === null, "Absent or unreadable fields must have a null answer");
        continue;
      }
      assert(typeof answer.value === "string" && answer.value.trim().length > 0, "Visible fields require an answer");
      if (field === "date") {
        assert(/^\d{4}-\d{2}-\d{2}$/.test(answer.value) && new Date(answer.value).toISOString().slice(0, 10) === answer.value, "Use a valid ISO date");
      }
      if (field === "currency") assert(["GBP", "KRW", "USD"].includes(answer.value), "Use a supported currency code");
      if (field === "total") assert(amountUnits(answer.value, receipt.currency.value) !== null, "Use an unformatted decimal amount");
    }
  }
}

export function evaluateSamples(answers, predictions) {
  const summary = {
    images: answers.length, humanReviewedImages: 0, missingRuns: 0, failedRuns: 0,
    receiptCounts: { evaluated: 0, correct: 0 },
    fields: Object.fromEntries(fields.map((field) => [field, { evaluated: 0, correct: 0, missing: 0, wrong: 0 }])),
    completeDrafts: { evaluated: 0, correct: 0 }, multiReceiptMappingPending: 0,
    ocr: { edits: 0, characters: 0, characterErrorRate: null },
  };
  for (const sample of answers) {
    if (!sample.reviewedBy || !sample.reviewedAt) continue;
    validateAnswer(sample);
    summary.humanReviewedImages++;
    const prediction = predictions.find((entry) => entry.sha256 === sample.sha256);
    if (!prediction) { summary.missingRuns++; continue; }
    if (prediction.error) { summary.failedRuns++; continue; }
    assert(Array.isArray(prediction.receipts), "Invalid prediction document list");
    summary.receiptCounts.evaluated++;
    const countCorrect = sample.receiptCount === prediction.receipts.length;
    if (countCorrect) summary.receiptCounts.correct++;
    // Single-receipt inputs always use document zero, even if the provider returned extras.
    // Multiple receipts require a human association; never select by matching field values.
    const mapping = sample.receiptCount === 1 ? [0] : sample.documentIndices;
    if (sample.receiptCount > 1 && (!sample.mappingReviewedBy || !Array.isArray(mapping) || mapping.length !== sample.receiptCount)) {
      summary.multiReceiptMappingPending++;
    } else {
      assert(new Set(mapping ?? []).size === (mapping ?? []).length, "A prediction cannot be matched to two receipts");
      for (const [index, truth] of sample.receipts.entries()) {
        const mapped = mapping[index];
        assert(mapped === null || (Number.isInteger(mapped) && mapped >= 0), "Invalid document association");
        const actual = mapped === null ? {} : prediction.receipts[mapped] ?? {};
        let allCorrect = countCorrect;
        const complete = fields.every((field) => truth[field].state === "visible");
        for (const field of fields) {
          const answer = truth[field];
          if (answer.state === "unreadable" || answer.state === "unreviewed") continue;
          if (field === "total" && truth.currency.state !== "visible") continue;
          const metric = summary.fields[field];
          metric.evaluated++;
          const value = actual[field] ?? null;
          let correct = answer.state === "absent" ? value === null : value !== null;
          if (correct && answer.state === "visible") {
            if (field === "total") correct = amountUnits(String(value), truth.currency.value) === amountUnits(answer.value, truth.currency.value);
            else if (field === "merchant") correct = [answer.value, ...(answer.aliases ?? [])].some((name) => normalizeName(name) === normalizeName(value));
            else correct = answer.value === value;
          }
          if (correct) metric.correct++;
          else if (value === null) metric.missing++;
          else metric.wrong++;
          allCorrect &&= correct;
        }
        if (complete) { summary.completeDrafts.evaluated++; if (allCorrect) summary.completeDrafts.correct++; }
      }
    }
    if (typeof sample.fullText === "string" && sample.fullText.length && typeof prediction.text === "string") {
      const distance = characterDistance(sample.fullText, prediction.text);
      summary.ocr.edits += distance.edits;
      summary.ocr.characters += distance.characters;
    }
  }
  if (summary.ocr.characters) summary.ocr.characterErrorRate = summary.ocr.edits / summary.ocr.characters;
  return summary;
}
