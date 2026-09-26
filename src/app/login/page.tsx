"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("먼저 web/.env.local에 Supabase URL과 publishable key를 설정해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    setMessage(error ? error.message : "로그인되었습니다. 대시보드로 이동합니다.");
    if (!error) router.push("/workspace");
  }

  async function signInWithProvider(provider: "google" | "github") {
    if (!configured) {
      setMessage("Supabase is not configured.");
      return;
    }

    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      setMessage(error.message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <Link href="/workspace" className="text-sm text-slate-500 hover:text-slate-900">← Workspace</Link>
        <h1 className="mt-7 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          계정이 연결되면 계획·실제 원장을 사용자별로 안전하게 저장합니다.
        </p>
        <form className="mt-7 space-y-4" onSubmit={signIn}>
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-900"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-900"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {message && <p className="text-sm text-slate-600" role="status">{message}</p>}
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />or continue with<span className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={loading || !configured}
            onClick={() => void signInWithProvider("google")}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with Google
          </button>
          <button
            type="button"
            disabled={loading || !configured}
            onClick={() => void signInWithProvider("github")}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with GitHub
          </button>
        </div>
        {!configured && (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-200">
            로컬 데모는 로그인 없이 대시보드를 볼 수 있습니다. Supabase 프로젝트를 만든 뒤 환경변수를 채우면 이 화면이 활성화됩니다.
          </p>
        )}
      </section>
    </main>
  );
}
