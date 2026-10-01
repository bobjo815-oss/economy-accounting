"use client";

import { useMemo, useState } from "react";
import { commonCurrencies, currencyDisplayName, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";

type Props = {
  value: CurrencyCode | "";
  onChange: (value: CurrencyCode) => void;
  locale: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
};

export function CurrencySelect({ value, onChange, locale, disabled, required, className, id }: Props) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase(locale);
  const matches = useMemo(() => supportedCurrencies.filter((code) => {
    if (!normalized) return true;
    return code.toLocaleLowerCase(locale).includes(normalized) ||
      currencyDisplayName(code, locale).toLocaleLowerCase(locale).includes(normalized);
  }), [locale, normalized]);
  const common = commonCurrencies.filter((code) => matches.includes(code));
  const remaining = matches.filter((code) => !(commonCurrencies as readonly string[]).includes(code));
  const label = locale === "ko" ? "통화 검색 (코드 또는 이름)" : "Search currency (code or name)";

  return <div className="mt-1 space-y-1">
    <input aria-label={label} type="search" value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled}
      placeholder={label} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
    <select id={id} required={required} disabled={disabled} value={value} onChange={(event) => { onChange(event.target.value as CurrencyCode); setQuery(""); }} className={className}>
      <option value="">{locale === "ko" ? "통화 선택" : "Select currency"}</option>
      {common.length > 0 && <optgroup label={locale === "ko" ? "주요 통화" : "Major currencies"}>
        {common.map((code) => <option key={code} value={code}>{code} — {currencyDisplayName(code, locale)}</option>)}
      </optgroup>}
      {remaining.length > 0 && <optgroup label={locale === "ko" ? "전체 ISO 4217 통화" : "All ISO 4217 currencies"}>
        {remaining.map((code) => <option key={code} value={code}>{code} — {currencyDisplayName(code, locale)}</option>)}
      </optgroup>}
      {value && !matches.includes(value) && <option value={value}>{value} — {currencyDisplayName(value, locale)}</option>}
    </select>
  </div>;
}
