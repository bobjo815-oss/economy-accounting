import { formatMinor, type CurrencyCode } from "@/lib/finance/money";

const colors = ["#0f766e", "#2563eb", "#d97706", "#be123c", "#7c3aed", "#0891b2", "#4d7c0f", "#9333ea", "#475569"];

type Slice = { key: string; label: string; amountMinor: bigint };

function point(angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: 100 + 96 * Math.cos(radians), y: 100 + 96 * Math.sin(radians) };
}

function buildPaths(rows: Slice[], total: bigint): (Slice & { color: string; path: string | null })[] {
  let angle = 0;
  const paths = [];
  for (const [index, row] of rows.entries()) {
    const start = angle;
    const fraction = total === BigInt(0) ? 0 : Number(row.amountMinor * BigInt(1_000_000_000) / total) / 1_000_000_000;
    const sweep = index === rows.length - 1 ? 360 - angle : fraction * 360;
    angle += sweep;
    if (rows.length === 1) {
      paths.push({ ...row, color: colors[index % colors.length], path: null });
      continue;
    }
    const from = point(start);
    const to = point(start + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    paths.push({ ...row, color: colors[index % colors.length], path: `M 100 100 L ${from.x} ${from.y} A 96 96 0 ${largeArc} 1 ${to.x} ${to.y} Z` });
  }
  return paths;
}

export default function CompositionPie({ title, rows, currency, emptyLabel }: {
  title: string;
  rows: Slice[];
  currency: CurrencyCode;
  emptyLabel: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.amountMinor, BigInt(0));
  const paths = buildPaths(rows, total);

  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" aria-label={title}>
    <h3 className="font-semibold">{title}</h3>
    {rows.length === 0 ? <p className="mt-4 text-sm text-slate-600">{emptyLabel}</p> : <div className="mt-4 grid items-center gap-5 sm:grid-cols-[minmax(150px,220px)_1fr]">
      <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${formatMinor(total, currency)}`} className="mx-auto w-full max-w-[220px]">
        <title>{`${title}: ${formatMinor(total, currency)}`}</title>
        {paths.map((slice) => slice.path
          ? <path key={slice.key} d={slice.path} fill={slice.color}><title>{slice.label}: {formatMinor(slice.amountMinor, currency)}</title></path>
          : <circle key={slice.key} cx="100" cy="100" r="96" fill={slice.color}><title>{slice.label}: {formatMinor(slice.amountMinor, currency)}</title></circle>)}
      </svg>
      <ul className="space-y-2 text-sm">
        {paths.map((slice) => {
          const percent = Number(slice.amountMinor * BigInt(1000) / total) / 10;
          return <li key={slice.key} className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2"><span aria-hidden="true" className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} /><span className="break-words">{slice.label}</span></span>
            <span className="shrink-0 text-right tabular-nums">{formatMinor(slice.amountMinor, currency)} <span className="text-slate-500">{percent}%</span></span>
          </li>;
        })}
        <li className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{formatMinor(total, currency)}</span></li>
      </ul>
    </div>}
  </section>;
}
