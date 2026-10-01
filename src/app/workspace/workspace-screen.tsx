import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSection } from "@/lib/finance/navigation";
import Workspace from "./workspace";

export default async function WorkspaceScreen({ section }: { section: WorkspaceSection }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/login");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return <Workspace key={section} userId={user.id} section={section} />;
}
