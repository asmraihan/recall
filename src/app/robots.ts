import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/public-lessons";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/dashboard/lessons$", "/dashboard/lessons/"],
      disallow: ["/api/", "/auth/", "/dashboard/", "/profile/", "/words/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
