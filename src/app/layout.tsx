import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { LanguageProvider } from "@/lib/i18n/provider";
import { resolveLocale } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: "Study Finance Tracker",
  description: "Private study-abroad finance planning and settlement tracker.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = resolveLocale((await cookies()).get("study-finance-language")?.value);
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col"><LanguageProvider initialLocale={locale}>{children}</LanguageProvider></body>
    </html>
  );
}
