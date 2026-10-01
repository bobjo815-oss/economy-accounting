import { parseCsv, type StatementCell, type StatementTable } from "./parse.ts";
import { Parser } from "saxen";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 3012;
const MAX_ARCHIVE_ENTRIES = 256;
const MAX_XML_BYTES = 32 * 1024 * 1024;
const MAX_XML_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_WORKSHEET_COLUMNS = 256;
const MAX_WORKSHEET_CELLS = 1_000_000;
const ZIP_CHUNK_BYTES = 1024;

function oversizedWorkbook() {
  return new Error("The XLSX workbook expands beyond the supported size. Choose a smaller statement.");
}

// The XLSX parser fills gaps up to each row/cell address before our final row
// check. Validate addresses with an XML parser first: a tiny r="1e309" would
// otherwise keep its row-expansion loop running indefinitely.
function worksheetDimensions(bytes: Uint8Array) {
  const parser = new Parser();
  let maxRow = 0;
  let maxColumn = 0;
  let currentRow = 0;
  let inSheetData = false;
  parser.on("openTag", (name, getAttributes, decodeEntities) => {
    const tag = name.slice(name.lastIndexOf(":") + 1);
    if (tag === "sheetData") { inSheetData = true; return; }
    if (!inSheetData || (tag !== "row" && tag !== "c")) return;
    const attributes = getAttributes();
    const raw = attributes.r;
    if (tag === "row") {
      const address = raw === undefined ? String(currentRow + 1) : decodeEntities(raw);
      if (!/^[1-9]\d*$/.test(address) || address.length > 4 || Number(address) > MAX_ROWS) throw oversizedWorkbook();
      currentRow = Number(address);
      maxRow = Math.max(maxRow, currentRow);
      return;
    }
    const address = raw === undefined ? "" : decodeEntities(raw);
    const match = /^([A-Z]+)([1-9]\d*)$/.exec(address);
    if (!match || match[2].length > 4 || Number(match[2]) > MAX_ROWS || match[1].length > 2) throw oversizedWorkbook();
    let column = 0;
    for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
    if (column > MAX_WORKSHEET_COLUMNS) throw oversizedWorkbook();
    maxRow = Math.max(maxRow, Number(match[2]));
    maxColumn = Math.max(maxColumn, column);
  });
  parser.on("closeTag", (name) => {
    if (name.slice(name.lastIndexOf(":") + 1) === "sheetData") inSheetData = false;
  });
  const error = parser.parse(new TextDecoder().decode(bytes));
  if (error) throw new Error("The XLSX worksheet could not be read.");
  return maxRow * Math.max(1, maxColumn);
}

// read-excel-file inflates every XML entry before it can check the row count.
// Stream those entries through a byte budget, then pass only the checked bytes
// to the parser so ZIP metadata cannot disagree with what the parser receives.
async function boundedXlsxArchive(file: File): Promise<ArrayBuffer> {
  const { Unzip, UnzipInflate, zipSync } = await import("fflate");
  const xmlEntries: Record<string, Uint8Array> = Object.create(null);
  const seenNames = new Set<string>();
  let entryCount = 0;
  let xmlBytes = 0;
  let activeEntries = 0;
  let streamError: Error | null = null;

  const unzip = new Unzip((entry) => {
    entryCount += 1;
    if (entryCount > MAX_ARCHIVE_ENTRIES) throw oversizedWorkbook();
    if (!entry.name.endsWith(".xml") && !entry.name.endsWith(".xml.rels")) return;
    if (entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").includes("..") || seenNames.has(entry.name)) {
      throw new Error("The XLSX archive contains an invalid XML path.");
    }
    seenNames.add(entry.name);
    if (entry.originalSize !== undefined && entry.originalSize > MAX_XML_ENTRY_BYTES) throw oversizedWorkbook();
    if (entry.compression !== 0 && entry.compression !== 8) throw new Error("The XLSX archive uses unsupported compression.");

    activeEntries += 1;
    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    entry.ondata = (error, chunk, final) => {
      if (streamError) return;
      if (error) { streamError = new Error("The XLSX archive could not be read."); return; }
      entryBytes += chunk.length;
      xmlBytes += chunk.length;
      if (entryBytes > MAX_XML_ENTRY_BYTES || xmlBytes > MAX_XML_BYTES) {
        streamError = oversizedWorkbook();
        entry.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const bytes = new Uint8Array(entryBytes);
        let offset = 0;
        for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
        chunks.length = 0;
        xmlEntries[entry.name] = bytes;
        activeEntries -= 1;
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { finished = true; break; }
      for (let offset = 0; offset < value.length; offset += ZIP_CHUNK_BYTES) {
        unzip.push(value.subarray(offset, offset + ZIP_CHUNK_BYTES));
        if (streamError) throw streamError;
      }
    }
    unzip.push(new Uint8Array(0), true);
    if (streamError) throw streamError;
    if (activeEntries || seenNames.size === 0) throw new Error("The XLSX archive is incomplete.");
    let materializedCells = 0;
    for (const [name, bytes] of Object.entries(xmlEntries)) {
      if (!name.endsWith(".xml")) continue;
      materializedCells += worksheetDimensions(bytes);
      if (materializedCells > MAX_WORKSHEET_CELLS) throw oversizedWorkbook();
    }
    const checked = zipSync(xmlEntries, { level: 0 });
    return checked.buffer.slice(checked.byteOffset, checked.byteOffset + checked.byteLength) as ArrayBuffer;
  } finally {
    if (!finished) await reader.cancel();
    reader.releaseLock();
  }
}

export async function readStatementFile(file: File, encoding: "utf-8" | "euc-kr" | "windows-1252"): Promise<StatementTable[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Statement files must be 5 MB or smaller.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = new TextDecoder(encoding).decode(await file.arrayBuffer());
    return [parseCsv(text)];
  }
  if (!name.endsWith(".xlsx")) throw new Error("Choose a CSV or XLSX statement.");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(await boundedXlsxArchive(file));
  return sheets.map((sheet) => {
    if (sheet.data.length > MAX_ROWS) throw new Error("Statement files are limited to 3,000 transaction rows.");
    return { name: sheet.sheet, rows: sheet.data as StatementCell[][] };
  });
}
