import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { getSitePages } from "@/lib/site/pages";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: `About | ${brand.companyName}`,
  description: siteConfig.seo.description,
};

export default function AboutPage() {
  const { AboutPage: SiteAbout } = getSitePages();
  if (!SiteAbout) redirect("/our-story");
  return <SiteAbout />;
}
