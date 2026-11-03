import type { MetadataRoute } from "next";
import { siteUpdated, siteUrl } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(siteUpdated),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
