export const SITE_URL = "https://recall-io.vercel.app";
export const LESSONS_PATH = "/dashboard/lessons";

export function isPublicLessonPath(pathname: string) {
  return pathname === LESSONS_PATH || pathname.startsWith(`${LESSONS_PATH}/`);
}

export function lessonUrl(slug?: string) {
  return `${SITE_URL}${LESSONS_PATH}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
}
