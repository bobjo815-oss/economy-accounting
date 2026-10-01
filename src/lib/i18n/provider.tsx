"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translate, type Locale } from "./messages";

const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (text: string) => string }>({ locale: "ko", setLocale: () => {}, t: (text) => text });

export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setCurrentLocale] = useState(initialLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  function setLocale(next: Locale) {
    setCurrentLocale(next);
    document.cookie = `study-finance-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  return <LanguageContext.Provider value={{ locale, setLocale, t: (text) => translate(locale, text) }}>
    <div className="flex justify-end gap-2 border-b border-slate-200 bg-white px-5 py-2 text-sm text-slate-950" role="group" aria-label="Language / 언어">
      <button type="button" lang="ko" aria-pressed={locale === "ko"} onClick={() => setLocale("ko")} className={`rounded px-3 py-1 ${locale === "ko" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>한국어</button>
      <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")} className={`rounded px-3 py-1 ${locale === "en" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>English</button>
    </div>
    {children}
  </LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }
