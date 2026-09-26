import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Finance Tracker",
  description: "Private study-abroad finance planning and settlement tracker.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
