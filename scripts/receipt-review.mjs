import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const labels = { merchant: "상점명", date: "거래 날짜", total: "총액", currency: "통화", Description: "품목명", Quantity: "수량", Price: "단가", TotalPrice: "품목 금액", ProductCode: "상품 코드", QuantityUnit: "수량 단위" };
const value = (field) => field?.valueString ?? field?.valueNumber ?? (field?.valueCurrency ? `${field.valueCurrency.amount ?? ""} ${field.valueCurrency.currencyCode ?? ""}`.trim() : field?.content ?? "");

export function renderReview(samples) {
  const options = samples.map((sample, index) => `<option value="${index}">${index + 1}. ${escape(sample.file)}</option>`).join("");
  const cards = samples.map((sample, index) => {
    const receipts = sample.prediction?.receipts ?? [];
    const details = receipts.map((receipt, i) => `<section class="draft"><h3>추출된 영수증 ${i + 1} <small>미검증 초안</small></h3><dl>${["merchant", "date", "total", "currency"].map((key) => `<dt>${labels[key]}</dt><dd>${receipt[key] == null ? '<span class="missing">추출되지 않음</span>' : escape(receipt[key])}</dd>`).join("")}</dl><h4>품목 (${receipt.items?.length ?? 0}개)</h4>${receipt.items?.length ? receipt.items.map((item, n) => `<details><summary>품목 ${n + 1}: ${escape(value(item.Description) || "이름 확인 필요")}</summary><dl>${Object.entries(item).map(([key, field]) => `<dt>${escape(labels[key] ?? key)}</dt><dd>${escape(value(field)) || "—"}</dd>`).join("")}</dl></details>`).join("") : '<p class="muted">추출된 품목이 없습니다.</p>'}</section>`).join("");
    return `<article data-index="${index}" ${index ? "hidden" : ""}><h2>${escape(sample.file)}</h2><div class="columns"><section class="original"><h3>원본 사진</h3><p class="muted">사진 속 영수증 수와 아래 추출 건수를 먼저 비교하세요. 사진을 클릭하면 확대됩니다.</p><button class="photo" aria-label="원본 사진 확대/축소"><img loading="lazy" src="${sample.image}" alt="원본 ${escape(sample.file)}"></button></section><section class="results"><p class="count">Azure 추출: ${receipts.length}건 · 정확도 검증 전</p>${sample.prediction?.error ? '<p class="missing">분석이 완료되지 않았습니다.</p>' : ""}${details}<details class="raw"><summary>읽어낸 전체 텍스트 보기</summary><pre>${escape(sample.prediction?.text)}</pre></details></section></div></article>`;
  }).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>영수증 OCR 검토</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#17263c;font:16px/1.6 system-ui,sans-serif}header{padding:24px 32px;background:#fff;border-bottom:1px solid #d6dfea}h1{margin:0;font-size:26px}header p{margin:8px 0}.notice{color:#725215;background:#fff7df;padding:12px 16px;border-radius:8px}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:20px}button,select{font:inherit;padding:9px 15px;border:1px solid #c3cede;border-radius:8px;background:white;color:inherit}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}select{min-width:260px}main{max-width:1800px;margin:auto;padding:20px 32px}h2{margin:0 0 16px;font-size:22px}.columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:24px}.original,.draft,.raw{background:#fff;padding:20px;border:1px solid #d6dfea;border-radius:12px}.original{align-self:start}.photo{display:block;width:100%;padding:0;border:0;overflow:auto;max-height:78vh;text-align:left}.photo img{display:block;width:100%;height:auto}.photo.zoom img{width:auto;max-width:none}.draft{margin-bottom:16px}h3{margin:0 0 12px}small{font-size:12px;color:#725215;background:#fff0c6;padding:4px 8px;border-radius:6px}dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 16px;margin:12px 0}dt{color:#64748b}dd{margin:0;overflow-wrap:anywhere}details{padding:8px 0;border-top:1px solid #e4eaf2}summary{cursor:pointer;font-weight:600}.muted{color:#64748b;font-size:14px}.missing{color:#b42318}.count{font-weight:600;margin-top:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 system-ui}a,button,select,summary{outline-offset:4px}[hidden]{display:none!important}@media(max-width:900px){.columns{grid-template-columns:1fr}header,main{padding:18px}.photo{max-height:65vh}}
</style></head><body><header><h1>영수증 OCR 검토 · ${samples.length}개 이미지</h1><p>원본 사진과 추출 결과를 비교하는 비공개 로컬 자료입니다. 인터넷 연결 없이 열 수 있습니다.</p><p class="notice">값이 채워졌어도 정답이라는 뜻은 아닙니다. 상점명·날짜·총액·통화와 누락된 영수증/품목을 확인하세요. 이 페이지는 금융 기록을 저장하거나 변경하지 않습니다.</p><nav class="toolbar" aria-label="이미지 선택"><button id="previous">← 이전</button><label for="sample">검토할 이미지</label><select id="sample">${options}</select><button id="next">다음 →</button><span id="position" aria-live="polite"></span></nav></header><main>${cards}</main><script>
const select=document.getElementById('sample'),previous=document.getElementById('previous'),next=document.getElementById('next'),articles=[...document.querySelectorAll('article')];
function show(index){select.value=String(index);articles.forEach((a,i)=>a.hidden=i!==index);previous.disabled=index===0;next.disabled=index===articles.length-1;document.getElementById('position').textContent=(index+1)+' / '+articles.length;}
select.addEventListener('change',()=>show(Number(select.value)));previous.addEventListener('click',()=>show(Number(select.value)-1));next.addEventListener('click',()=>show(Number(select.value)+1));document.querySelectorAll('.photo').forEach(b=>b.addEventListener('click',()=>b.classList.toggle('zoom')));show(0);
</script></body></html>`;
}

async function generate(filename) {
  if (!filename || path.basename(filename) !== filename || !/^Predictions-.*\.json$/.test(filename)) throw new Error("Use a private prediction filename");
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const root = path.join(project, "data", "receipt-evaluation");
  const answers = JSON.parse(await readFile(path.join(root, "Answers.json"), "utf8"));
  const predictions = JSON.parse(await readFile(path.join(root, filename), "utf8"));
  const samples = [];
  for (const sample of answers.samples) {
    if (path.basename(sample.file) !== sample.file || !/\.(jpe?g|png)$/i.test(sample.file)) throw new Error("Invalid source filename");
    const buffer = await readFile(path.join(project, "..", "receipts-samples", sample.file));
    if (createHash("sha256").update(buffer).digest("hex") !== sample.sha256) throw new Error("Source changed");
    samples.push({ file: sample.file, image: `data:image/${/\.png$/i.test(sample.file) ? "png" : "jpeg"};base64,${buffer.toString("base64")}`, prediction: predictions.samples.find(p => p.sha256 === sample.sha256) });
  }
  const output = path.join(root, "Receipt-Review.html");
  await writeFile(output, renderReview(samples));
  console.log(JSON.stringify({ reviewFile: output, images: samples.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate(process.argv[2]).catch(() => { console.error("Review generation failed; private details omitted"); process.exitCode = 1; });
}
