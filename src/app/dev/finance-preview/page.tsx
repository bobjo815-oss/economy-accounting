import { notFound } from "next/navigation";
import FinancePreviewClient from "./preview-client";

export const dynamic = "force-dynamic";

export default function FinancePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h1 className="font-semibold">개발용 화면 미리보기 · Local-only preview</h1>
          <p className="mt-1 text-sm">가짜 예시 자료만 사용합니다. 로그인·Supabase 연결·저장은 없습니다.</p>
          <p className="text-sm">Synthetic sample data only. No sign-in, Supabase connection, or writes.</p>
        </header>
        <FinancePreviewClient />
      </div>
    </main>
  );
}
