import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";

type SearchParams = { experience?: string };

/**
 * Legacy /book route — redirects to the custom booking flow at /booking.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const experience = typeof params.experience === "string" ? params.experience : null;
  const path = siteConfig.booking.path ?? "/booking";
  const url = experience ? `${path}?experience=${encodeURIComponent(experience)}` : path;
  redirect(url);
}
