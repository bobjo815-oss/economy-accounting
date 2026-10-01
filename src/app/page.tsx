import { redirect } from "next/navigation";
import { recoveryCallbackPath } from "@/lib/auth/recovery-redirect";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) redirect(recoveryCallbackPath(code));
  redirect("/workspace");
}
