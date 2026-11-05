import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
import { navItemFor } from "@/lib/nav";

/**
 * Menu destinations that later phases will build. A real page added at the same path
 * (e.g. app/(dashboard)/customers/page.tsx) takes precedence over this catch-all.
 */
export default async function PlannedScreen({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const item = navItemFor(`/${slug.join("/")}`);
  if (!item) notFound();
  return <ComingSoon title={item.label} phase={item.phase} />;
}
