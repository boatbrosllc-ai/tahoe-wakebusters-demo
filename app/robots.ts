import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/booking/cancel",
        "/booking/manage/",
        "/booking/success",
        "/waiver/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
