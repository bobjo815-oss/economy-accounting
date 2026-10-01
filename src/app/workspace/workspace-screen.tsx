import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requiresStrongSession } from "@/lib/auth/assurance";
import type { WorkspaceSection } from "@/lib/finance/navigation";
import Workspace from "./workspace";

export default async function WorkspaceScreen({ section, reviewTarget }: { section: WorkspaceSection; reviewTarget?: string }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/login");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const [factors, assurance] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factors.error || assurance.error) redirect("/settings/security");
  const verifiedTotp = factors.data.totp.filter((factor) => factor.status === "verified");
  if (requiresStrongSession(verifiedTotp.length, assurance.data.currentLevel, assurance.data.nextLevel)) redirect("/settings/security");
  return <Workspace key={`${section}-${reviewTarget ?? ""}`} userId={user.id} section={section} reviewTarget={reviewTarget} />;
}
