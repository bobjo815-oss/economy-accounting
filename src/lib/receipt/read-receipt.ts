import { parseReceiptText } from "./parse";

type Progress = (status: string, progress: number) => void;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 5;
const MAX_IMAGE_EDGE = 2600;

function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = new Image();
  const url = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not prepare this image.");

  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    bitmap.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
      canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    bitmap.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format could not be read. Try a JPG, PNG, or WebP image."));
    };
    bitmap.src = url;
  });
}

function enhanceReceiptImage(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not prepare this image.");
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
    image.data[index] = value;
    histogram[value] += 1;
  }
  const pixels = canvas.width * canvas.height;
  let seen = 0, low = 0, high = 255;
  for (let value = 0; value < 256; value += 1) {
    seen += histogram[value];
    if (seen < pixels * 0.01) low = value;
    if (seen < pixels * 0.99) high = value;
  }
  const range = Math.max(1, high - low);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.max(0, Math.min(255, Math.round((image.data[index] - low) * 255 / range)));
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function pdfPageLines(items: Array<{ str?: string; transform?: number[] }>): string[] {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    if (!item.str?.trim() || !item.transform) continue;
    const y = Math.round(item.transform[5] / 3) * 3;
    const row = rows.get(y) ?? [];
    row.push({ x: item.transform[4], text: item.str.trim() });
    rows.set(y, row);
  }
  return [...rows.entries()].sort(([left], [right]) => right - left).map(([, row]) =>
    row.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "),
  ).filter(Boolean);
}

export async function readReceiptFile(file: File, onProgress: Progress): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Receipt files must be 15 MB or smaller.");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!isPdf && !isImage) throw new Error("Choose a JPG, PNG, WebP photo, or PDF.");

  const { createWorker } = await import("tesseract.js");
  const workerRef: { current?: Awaited<ReturnType<typeof createWorker>> } = {};
  const getWorker = async () => {
    if (!workerRef.current) {
      onProgress("Loading on-device text recognition…", 0);
      workerRef.current = await createWorker("eng+kor", 1, {
        workerPath: "/ocr/worker.min.js",
        langPath: "/ocr/lang/4.0.0_best_int",
        corePath: "/ocr/core",
        gzip: true,
        logger: (message) => onProgress(message.status, message.progress),
      });
    }
    return workerRef.current;
  };

  try {
    if (isImage) {
      const image = await prepareImage(file);
      onProgress("Reading receipt text…", 0);
      const result = await (await getWorker()).recognize(image);
      const first = parseReceiptText(result.data.text);
      if (first.total && first.date) return result.data.text;
      onProgress("Checking faint receipt text…", 0);
      const enhanced = await (await getWorker()).recognize(enhanceReceiptImage(image));
      const second = parseReceiptText(enhanced.data.text);
      const score = (draft: typeof first) => Number(!!draft.merchant) + Number(!!draft.date) * 2 + Number(!!draft.total) * 2 + Number(!!draft.currency);
      return score(second) > score(first) ? enhanced.data.text : result.data.text;
    }

    onProgress("Opening PDF on this device…", 0);
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      enableXfa: false,
    });
    try {
      const pdfDocument = await loadingTask.promise;
      if (pdfDocument.numPages > MAX_PDF_PAGES) throw new Error("PDF receipts are limited to 5 pages.");

      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        onProgress(`Reading PDF page ${pageNumber} of ${pdfDocument.numPages}…`, pageNumber / pdfDocument.numPages);
        const page = await pdfDocument.getPage(pageNumber);
        const textLines = pdfPageLines((await page.getTextContent()).items as Array<{ str?: string; transform?: number[] }>);
        if (textLines.join(" ").replace(/\s/g, "").length >= 35 && /\d/.test(textLines.join(" "))) {
          pages.push(textLines.join("\n"));
          page.cleanup();
          continue;
        }

        const initialViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.6, MAX_IMAGE_EDGE / Math.max(initialViewport.width, initialViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The browser could not render this PDF page.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const result = await (await getWorker()).recognize(canvas);
        pages.push(result.data.text);
        page.cleanup();
      }
      return pages.join("\n");
    } finally {
      await loadingTask.destroy();
    }
  } finally {
    await workerRef.current?.terminate();
  }
}
