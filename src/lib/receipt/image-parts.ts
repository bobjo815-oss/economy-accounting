export type ImageSplit = { axis: "rows" | "columns"; count: number; rotation: 0 | 90 | 270 };

export function imagePartBoxes(width: number, height: number, split: ImageSplit) {
  if (!Number.isInteger(split.count) || split.count < 1 || split.count > 6 || width < 1 || height < 1) {
    throw new Error("Choose between one and six receipts in a valid image.");
  }
  return Array.from({ length: split.count }, (_, index) => {
    const start = Math.round((split.axis === "rows" ? height : width) * index / split.count);
    const end = Math.round((split.axis === "rows" ? height : width) * (index + 1) / split.count);
    return split.axis === "rows"
      ? { x: 0, y: start, width, height: end - start }
      : { x: start, y: 0, width: end - start, height };
  });
}

export async function splitReceiptImage(file: File, split: ImageSplit): Promise<File[]> {
  const source = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      source.onload = () => resolve();
      source.onerror = () => reject(new Error("This photo could not be opened."));
      source.src = url;
    });
    const boxes = imagePartBoxes(source.naturalWidth, source.naturalHeight, split);
    return await Promise.all(boxes.map(async (box, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = split.rotation ? box.height : box.width;
      canvas.height = split.rotation ? box.width : box.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not prepare this photo.");
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(split.rotation * Math.PI / 180);
      context.drawImage(source, box.x, box.y, box.width, box.height, -box.width / 2, -box.height / 2, box.width, box.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The photo could not be cropped.")), "image/jpeg", 0.95));
      return new File([blob], `${file.name} — ${index + 1} of ${split.count}.jpg`, { type: "image/jpeg" });
    }));
  } finally {
    URL.revokeObjectURL(url);
  }
}
