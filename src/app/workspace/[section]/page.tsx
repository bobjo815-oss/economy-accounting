import { notFound, redirect } from "next/navigation";
import { isWorkspaceSection } from "@/lib/finance/navigation";
import WorkspaceScreen from "../workspace-screen";

export default async function SectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ review?: string | string[] }> }) {
  const { section } = await params;
  if (!isWorkspaceSection(section)) notFound();
  if (section === "overview") redirect("/workspace");
  const query = await searchParams;
  return <WorkspaceScreen section={section} reviewTarget={typeof query.review === "string" ? query.review : undefined} />;
}
