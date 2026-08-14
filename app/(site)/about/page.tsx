import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: `About | ${brand.companyName}`,
  description: siteConfig.seo.description,
};

export default function AboutPage() {
  redirect("/our-story");
}
