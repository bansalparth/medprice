import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/jan-aushadhi`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/upload`, changeFrequency: "monthly", priority: 0.6 },
  ];

  let medicineUrls: MetadataRoute.Sitemap = [];
  try {
    const meds = await prisma.medicine.findMany({
      where: { isCatalog: true },
      select: { id: true, updatedAt: true },
      take: 5000,
    });
    medicineUrls = meds.map((m) => ({
      url: `${SITE_URL}/search?medicineId=${m.id}`,
      lastModified: m.updatedAt,
      changeFrequency: "daily",
      priority: 0.7,
    }));
  } catch {
    // Database may not exist at build time on a fresh checkout; static URLs are still useful.
  }

  return [...staticUrls, ...medicineUrls];
}
