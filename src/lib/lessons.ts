import { promises as fs } from "fs";
import path from "path";
import { marked } from "marked";

const LESSONS_DIR = path.join(process.cwd(), "src", "assets", "lessons");

export interface LessonMeta {
  slug: string;
  title: string;
  filename: string;
}

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

export interface Lesson extends LessonMeta {
  html: string;
  toc: TocEntry[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function fileToSlug(filename: string): string {
  return filename.replace(/\.md$/i, "").replace(/_/g, "-").toLowerCase();
}

async function findFileForSlug(slug: string): Promise<string | null> {
  const entries = await fs.readdir(LESSONS_DIR);
  return (
    entries.find(
      (f) => f.toLowerCase().endsWith(".md") && fileToSlug(f) === slug
    ) ?? null
  );
}

function deriveTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

let configured = false;
function configureMarked() {
  if (configured) return;
  configured = true;

  marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, "");
        const id = slugify(plain);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
    },
  });
}

export async function listLessons(): Promise<LessonMeta[]> {
  const entries = await fs.readdir(LESSONS_DIR);
  const mdFiles = entries.filter((f) => f.toLowerCase().endsWith(".md")).sort();

  return Promise.all(
    mdFiles.map(async (filename) => {
      const raw = await fs.readFile(path.join(LESSONS_DIR, filename), "utf8");
      const slug = fileToSlug(filename);
      const title = deriveTitle(raw, filename.replace(/\.md$/i, ""));
      return { slug, title, filename };
    })
  );
}

export async function getLesson(slug: string): Promise<Lesson | null> {
  configureMarked();

  const filename = await findFileForSlug(slug);
  if (!filename) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(LESSONS_DIR, filename), "utf8");
  } catch {
    return null;
  }

  const title = deriveTitle(raw, filename.replace(/\.md$/i, ""));

  const toc: TocEntry[] = [];
  const headingRe = /^(#{2,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(raw)) !== null) {
    const depth = m[1].length;
    const text = m[2].trim().replace(/[*_`]/g, "");
    toc.push({ depth, text, id: slugify(text) });
  }

  const html = await marked.parse(raw);

  return { slug, title, filename, html, toc };
}
