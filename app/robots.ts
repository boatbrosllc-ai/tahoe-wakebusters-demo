import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/config/site";

const baseUrl = getSiteBaseUrl();

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
