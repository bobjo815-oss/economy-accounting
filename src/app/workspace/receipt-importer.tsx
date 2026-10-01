"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLanguage } from "@/lib/i18n/provider";
import { parseReceiptText, type ReceiptDraft } from "@/lib/receipt/parse";
import { readReceiptFile } from "@/lib/receipt/read-receipt";
import { splitReceiptImage, type ImageSplit } from "@/lib/receipt/image-parts";

type ReceiptResult = {
  id: string;
  name: string;
  previewUrl: string | null;
  draft: ReceiptDraft | null;
  error: string | null;
  applied: boolean;
};

type SelectedReceipt = {
  id: string;
  file: File;
  previewUrl: string | null;
  split: ImageSplit;
};

const MAX_BATCH_FILES = 20;

export default function ReceiptImporter({ onApply, blocked = false }: { onApply: (draft: ReceiptDraft, onSaved: () => void, onCancelled: () => void) => void; blocked?: boolean }) {
  const { t, locale } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<SelectedReceipt[]>([]);
  const [results, setResults] = useState<ReceiptResult[]>([]);
  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState("");
  const [openPreview, setOpenPreview] = useState<{ name: string; url: string } | null>(null);
  const previewUrls = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  function releasePreview(url: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
    if (openPreview?.url === url) setOpenPreview(null);
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    if (selected.length + files.length > MAX_BATCH_FILES) {
      setMessage(text(`한 번에 최대 ${MAX_BATCH_FILES}개까지 선택할 수 있습니다.`, `Choose up to ${MAX_BATCH_FILES} receipts at a time.`));
      return;
    }
    setMessage("");
    const incoming = files.map((file) => {
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrls.current.add(previewUrl);
      return { id: crypto.randomUUID(), file, previewUrl, split: { axis: "rows" as const, count: 1, rotation: 0 as const } };
    });
    setSelected((current) => [...current, ...incoming]);
  }

  async function processSelected() {
    if (!selected.length || busy || blocked) return;
    const files = selected;
    setBusy(true);
    setProgress(0);
    for (let index = 0; index < files.length; index += 1) {
      const { id, file, previewUrl, split } = files[index];
      setCurrentFile(`${index + 1}/${files.length} · ${file.name}`);
      try {
        const parts = file.type.startsWith("image/") && (split.count > 1 || split.rotation !== 0)
          ? await splitReceiptImage(file, split) : [file];
        for (const [partIndex, part] of parts.entries()) {
          const partPreview = part === file ? previewUrl : URL.createObjectURL(part);
          if (partPreview && part !== file) previewUrls.current.add(partPreview);
          try {
            setCurrentFile(`${index + 1}/${files.length} · ${part.name}`);
            const rawText = await readReceiptFile(part, (_status, value) => setProgress(value));
            setResults((current) => [...current, { id: part === file ? id : crypto.randomUUID(), name: part.name, previewUrl: partPreview, draft: parseReceiptText(rawText), error: null, applied: false }]);
          } catch (error) {
            setResults((current) => [...current, { id: crypto.randomUUID(), name: part.name, previewUrl: partPreview, draft: null, error: error instanceof Error ? error.message : "The receipt could not be read.", applied: false }]);
          }
          setProgress((partIndex + 1) / parts.length);
        }
        if (parts[0] !== file) releasePreview(previewUrl);
      } catch (error) {
        setResults((current) => [...current, { id, name: file.name, previewUrl, draft: null, error: error instanceof Error ? error.message : "The receipt could not be read.", applied: false }]);
      }
    }
    setSelected([]);
    setBusy(false);
    setCurrentFile("");
    setProgress(0);
  }

  function applyResult(item: ReceiptResult) {
    if (!item.draft || activeId || blocked) return;
    setActiveId(item.id);
    onApply(item.draft, () => {
      setResults((current) => current.map((entry) => entry.id === item.id ? { ...entry, applied: true } : entry));
      setActiveId(null);
    }, () => setActiveId(null));
  }

  function previewButton(name: string, url: string | null) {
    return url ? <button type="button" onClick={() => setOpenPreview({ name, url })} className="group relative flex h-28 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700" aria-label={text(`${name} 크게 보기`, `Enlarge ${name}`)}>
      <Image src={url} alt="" width={240} height={160} unoptimized className="h-full w-full object-contain transition-transform group-hover:scale-105" />
      <span className="absolute bottom-1 right-1 rounded bg-slate-950/75 px-2 py-0.5 text-xs text-white">{text("크게 보기", "Enlarge")}</span>
    </button> : <div className="flex h-28 items-center justify-center rounded-lg bg-slate-100 text-3xl" aria-hidden="true">📄</div>;
  }

  return <section className="sm:col-span-2 lg:col-span-4 rounded-xl border border-dashed border-teal-300 bg-teal-50/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-medium">{text("🧾 영수증에서 입력", "🧾 Fill from a receipt")}</h3>
        <p className="mt-1 text-xs text-slate-600">{text(`사진(JPG, PNG, WebP)이나 PDF를 최대 ${MAX_BATCH_FILES}개까지 선택하세요. 선택 후 사진을 확인하고 읽기를 시작할 수 있습니다. 파일은 기기에서만 처리하며 업로드하거나 저장하지 않습니다.`, `Choose up to ${MAX_BATCH_FILES} photos (JPG, PNG, WebP) or PDFs. Review the photos before starting recognition. Files stay on this device and are not uploaded or stored.`)}</p>
      </div>
      <label className="cursor-pointer rounded-lg border border-teal-300 bg-white px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50">
        {text("영수증 여러 장 선택", "Choose receipts")}
        <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" disabled={busy || blocked} onChange={selectFiles} className="sr-only" />
      </label>
    </div>
    {selected.length > 0 && <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="text-sm font-semibold">{text(`선택한 사진·파일 ${selected.length}개`, `${selected.length} selected photos/files`)}</h4><p className="text-xs text-slate-600">{text("사진 한 장에 영수증이 여러 개라면 아래에서 위아래 또는 좌우 개수와 글자 방향을 선택하세요. 각 조각을 별도 초안으로 읽습니다. Windows 파일 선택창의 미리보기는 사이트에서 변경할 수 없습니다.", "If one photo contains several receipts, choose their stacked or side-by-side count and text rotation below. Each part becomes a separate draft. The website cannot change Windows file-picker thumbnails.")}</p></div>
        <button type="button" onClick={() => void processSelected()} disabled={busy || blocked} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{text("선택한 영수증 읽기", "Read selected receipts")}</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {selected.map((item) => <article key={item.id} className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-slate-200">
          {previewButton(item.file.name, item.previewUrl)}
          <p className="mt-2 break-all text-xs font-medium" title={item.file.name}>{item.file.name}</p>
          {item.previewUrl && <div className="mt-2 grid gap-2 text-xs">
            <label>{text("사진 속 영수증", "Receipts in photo")}
              <select value={`${item.split.axis}:${item.split.count}`} onChange={(event) => { const [axis, count] = event.target.value.split(":"); setSelected((current) => current.map((entry) => entry.id === item.id ? { ...entry, split: { ...entry.split, axis: axis as ImageSplit["axis"], count: Number(count) } } : entry)); }} className="mt-1 w-full rounded border border-slate-300 bg-white p-1">
                <option value="rows:1">{text("한 장", "One receipt")}</option>
                {[2, 3, 4, 5, 6].map((count) => <option key={`rows:${count}`} value={`rows:${count}`}>{text(`위아래 ${count}장`, `${count} stacked vertically`)}</option>)}
                {[2, 3, 4, 5, 6].map((count) => <option key={`columns:${count}`} value={`columns:${count}`}>{text(`좌우 ${count}장`, `${count} side by side`)}</option>)}
              </select>
            </label>
            <label>{text("글자 방향", "Text direction")}
              <select value={item.split.rotation} onChange={(event) => setSelected((current) => current.map((entry) => entry.id === item.id ? { ...entry, split: { ...entry.split, rotation: Number(event.target.value) as ImageSplit["rotation"] } } : entry))} className="mt-1 w-full rounded border border-slate-300 bg-white p-1">
                <option value={0}>{text("그대로", "As shown")}</option>
                <option value={90}>{text("시계 방향 90°", "Rotate right 90°")}</option>
                <option value={270}>{text("반시계 방향 90°", "Rotate left 90°")}</option>
              </select>
            </label>
          </div>}
          <button type="button" disabled={busy} onClick={() => { releasePreview(item.previewUrl); setSelected((current) => current.filter((entry) => entry.id !== item.id)); }} className="mt-2 text-xs text-teal-900 underline disabled:opacity-50">{text("제외", "Remove")}</button>
        </article>)}
      </div>
    </div>}
    {busy && <div className="mt-3" role="status" aria-live="polite"><p className="text-sm text-slate-700">{text("기기에서 순서대로 읽고 있습니다…", "Processing receipts one at a time…")} {currentFile}</p><progress className="mt-2 h-2 w-full accent-teal-700" max={1} value={progress} /></div>}
    {message && <p role="status" className="mt-3 text-sm text-amber-800">{t(message)}</p>}
    {results.length > 0 && <div className="mt-4 space-y-3">
      <h4 className="text-sm font-semibold">{text("인식 결과 — 각 항목을 확인하세요", "Extracted receipts — review each one")}</h4>
      {results.map((item) => <article key={item.id} className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-24 shrink-0">{previewButton(item.name, item.previewUrl)}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="min-w-0 break-all text-sm font-medium">🧾 {item.name}</h5>{item.applied && <span className="text-xs text-teal-800">{text("저장됨", "Saved")}</span>}</div>
        {item.error ? <p role="status" className="mt-2 text-sm text-amber-800">{t(item.error)}</p> : item.draft && <>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-slate-500">{text("가게", "Shop")}: </dt><dd className="inline">{item.draft.merchant ?? text("찾지 못함", "Not found")}</dd></div>
            <div><dt className="inline text-slate-500">{text("날짜", "Date")}: </dt><dd className="inline">{item.draft.date ?? text("찾지 못함", "Not found")}</dd></div>
            <div><dt className="inline text-slate-500">{text("영수증 합계", "Receipt total")}: </dt><dd className="inline">{item.draft.total ? `${item.draft.total}${item.draft.currency ? ` ${item.draft.currency}` : ""}` : text("찾지 못함", "Not found")}</dd></div>
            <div><dt className="inline text-slate-500">{text("상품 항목", "Items")}: </dt><dd className="inline">{item.draft.items.length ? item.draft.items.slice(0, 8).join(", ") : text("찾지 못함", "Not found")}{item.draft.items.length > 8 ? ` +${item.draft.items.length - 8}` : ""}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => applyResult(item)} disabled={!!activeId || blocked || item.applied || (!item.draft.merchant && !item.draft.date && !item.draft.total)} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{activeId === item.id ? text("초안에서 확인 후 저장하세요", "Review and save this draft") : item.applied ? text("저장 완료", "Saved") : text("초안에 적용", "Use this receipt")}</button>
          </div>
        </>}
            {!item.applied && <button type="button" disabled={activeId === item.id} onClick={() => { releasePreview(item.previewUrl); setResults((current) => current.filter((entry) => entry.id !== item.id)); }} className="mt-2 text-sm underline disabled:opacity-50">{text("제외", "Remove")}</button>}
          </div>
        </div>
      </article>)}
      <p className="text-xs text-slate-600">{text("한 번에 한 영수증씩 입력란에 적용하고 저장한 뒤 다음 영수증을 처리합니다. 계좌 명세서의 최종 금액은 직접 입력해야 합니다. 품목은 미리보기만 하며 따로 저장하지 않습니다.", "Apply one receipt to the form and save it before moving to the next. Enter the final bank-statement amount yourself. Item names are preview-only and are not saved separately.")}</p>
    </div>}
    {openPreview && <div role="dialog" aria-modal="true" aria-label={openPreview.name} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-950/90 p-4" onKeyDown={(event) => { if (event.key === "Escape") setOpenPreview(null); }}>
      <div className="flex w-full max-w-5xl items-center justify-between gap-4 text-white"><p className="min-w-0 break-all text-sm">{openPreview.name}</p><button type="button" autoFocus onClick={() => setOpenPreview(null)} className="shrink-0 rounded-lg border border-white/60 px-3 py-1 text-sm">{text("닫기", "Close")}</button></div>
      <Image src={openPreview.url} alt={openPreview.name} width={1400} height={1800} unoptimized className="max-h-[85vh] w-auto max-w-full object-contain" />
    </div>}
  </section>;
}
