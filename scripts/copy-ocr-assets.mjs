import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const publicRoot = join(process.cwd(), "public", "ocr");
const tesseractRoot = dirname(require.resolve("tesseract.js/package.json"));
const coreRoot = join(dirname(tesseractRoot), "tesseract.js-core");
const pdfRoot = dirname(require.resolve("pdfjs-dist/package.json"));

async function copy(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

await copy(join(tesseractRoot, "dist", "worker.min.js"), join(publicRoot, "worker.min.js"));
await copy(join(pdfRoot, "build", "pdf.worker.min.mjs"), join(publicRoot, "pdf.worker.min.mjs"));

for (const flavor of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  for (const extension of ["wasm.js", "wasm"]) {
    const file = `tesseract-core-${flavor}.${extension}`;
    await copy(join(coreRoot, file), join(publicRoot, "core", file));
  }
}

for (const language of ["eng", "kor"]) {
  const packageRoot = dirname(require.resolve(`@tesseract.js-data/${language}`));
  await copy(
    join(packageRoot, "4.0.0_best_int", `${language}.traineddata.gz`),
    join(publicRoot, "lang", "4.0.0_best_int", `${language}.traineddata.gz`),
  );
}
