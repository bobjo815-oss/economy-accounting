import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/finance/records";
import AccountSettings from "./account-settings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const profile = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profile.error) throw new Error("Settings unavailable");
  return <AccountSettings userId={user.id} email={user.email ?? ""}
    providers={(user.identities ?? []).map((identity) => identity.provider)}
    profile={profile.data as ProfileRow | null} />;
}
