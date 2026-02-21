import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/share/invoice/", "/api/public/share/invoice/"],
      },
    ],
  };
}
