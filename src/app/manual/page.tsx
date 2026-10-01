import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGuideContext } from "@/lib/finance/user-guide";
import UserManual from "./user-manual";

export default async function ManualPage({ searchParams }: {
  searchParams: Promise<{ context?: string | string[]; view?: string | string[] }>;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const query = await searchParams;
  const context = getGuideContext(Array.isArray(query.context) ? query.context[0] : query.context);
  const showAll = query.view === "all";
  return <UserManual context={context} showAll={showAll} />;
}
