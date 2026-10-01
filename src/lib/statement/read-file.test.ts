import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { readStatementFile } from "./read-file.ts";

function xlsxFile(entries: Record<string, string>) {
  const zipped = zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)])));
  return new File([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], "statement.xlsx");
}

test("XLSX import keeps every sheet available for mapping", async () => {
  const file = xlsxFile({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Card" sheetId="1" r:id="rId1"/><sheet name="Bank" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Card entry</t></is></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="3"><c r="B3" t="inlineStr"><is><t>Bank entry</t></is></c></row></sheetData></worksheet>`,
  });
  const sheets = await readStatementFile(file, "utf-8");
  assert.deepEqual(sheets.map((sheet) => sheet.name), ["Card", "Bank"]);
  assert.equal(sheets[0].rows[0][0], "Card entry");
  assert.equal(sheets[1].rows[2][1], "Bank entry");
});

test("XLSX import bounds actual inflated bytes even when ZIP size metadata lies", async () => {
  const zipped = zipSync({ "xl/worksheets/sheet1.xml": strToU8("A".repeat(17 * 1024 * 1024)) });
  // Lie in the local header. The stream must use its observed output byte count.
  zipped[22] = 1; zipped[23] = 0; zipped[24] = 0; zipped[25] = 0;
  const file = new File([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], "statement.xlsx");
  assert.ok(file.size < 5 * 1024 * 1024);
  await assert.rejects(readStatementFile(file, "utf-8"), /expands beyond the supported size/);
});

test("XLSX import rejects sparse and non-finite worksheet addresses before parsing", async () => {
  for (const address of ["1048576", "1e309"]) {
    const file = xlsxFile({ "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="${address}"/></sheetData></worksheet>` });
    await assert.rejects(readStatementFile(file, "utf-8"), /expands beyond the supported size/);
  }
  const farColumn = xlsxFile({ "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="XFD1"/></row></sheetData></worksheet>' });
  await assert.rejects(readStatementFile(farColumn, "utf-8"), /expands beyond the supported size/);
});
