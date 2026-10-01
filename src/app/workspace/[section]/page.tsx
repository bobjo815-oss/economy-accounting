import { notFound, redirect } from "next/navigation";
import { isWorkspaceSection } from "@/lib/finance/navigation";
import WorkspaceScreen from "../workspace-screen";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isWorkspaceSection(section)) notFound();
  if (section === "overview") redirect("/workspace");
  return <WorkspaceScreen section={section} />;
}
