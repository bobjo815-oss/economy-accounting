"use client";

export type SortOption = { value: string; label: string };

export default function SortControl({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: SortOption[];
  onChange: (value: string) => void;
}) {
  return <label className="inline-flex items-center gap-2 text-sm text-slate-700">
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
