"use client";
import { useLanguage } from "@/lib/i18n/provider";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { passwordError } from "@/lib/auth/password-validation";

export default function SetPasswordPage() {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setReady(Boolean(data.session) && !error);
      if (!data.session || error) setMessage("Open your newest password-recovery email to set a password.");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) { setReady(true); setMessage(""); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = passwordError(password, confirmation);
    if (validation) { setMessage(validation); return; }
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) { setMessage("Password could not be saved. Your invitation may have expired; request a new one."); return; }
    setPassword(""); setConfirmation("");
    router.replace("/workspace");
    router.refresh();
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-950">
    <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-2xl font-semibold">{t("Set your Study Finance password")}</h1>
      <p className="mt-2 text-sm text-slate-500">{t("Use this page only from your newest password-recovery link. Your password stays in Supabase Auth; it is never stored in the finance ledger.")}</p>
      {ready && <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm">{t("New password")}<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block text-sm">{t("Confirm password")}<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("Save password")}</button>
      </form>}
      {!ready && !message && <p role="status" className="mt-6 text-sm text-slate-600">{t("Checking invitation…")}</p>}
      {message && <p role="status" className="mt-4 text-sm text-amber-800">{t(message)}</p>}
      {!ready && message && <Link href="/login" className="mt-4 inline-block text-sm font-medium text-slate-700 underline underline-offset-4">{t("Return to sign in and request a new link")}</Link>}
    </section>
  </main>;
}
