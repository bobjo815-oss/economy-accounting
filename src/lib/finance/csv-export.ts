function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  let prefixEnd = 0;
  while (prefixEnd < raw.length && (raw[prefixEnd].trim() === "" || raw.charCodeAt(prefixEnd) < 32)) prefixEnd += 1;
  const candidate = raw.slice(prefixEnd);
  const formula = /^[=+@]/.test(candidate) || (/^-/.test(candidate) && !/^-(?:\d+)(?:\.\d+)?$/.test(candidate));
  const safe = formula ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows: object[]) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((key) =>
    csvCell((row as Record<string, unknown>)[key])).join(","))].join("\r\n");
}
