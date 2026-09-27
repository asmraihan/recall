import type { MetadataRoute } from "next";
import { listLessons } from "@/lib/lessons";
import { lessonUrl } from "@/lib/public-lessons";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lessons = await listLessons();
  return [{ url: lessonUrl() }, ...lessons.map(({ slug }) => ({ url: lessonUrl(slug) }))];
}
