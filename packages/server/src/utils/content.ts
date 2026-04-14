import { stat } from "node:fs/promises";
import path from "node:path";

type ContentSlug = "help" | "about" | "privacy" | "user-agreement";

interface ContentPageRecord {
  slug: ContentSlug;
  title: string;
  body: string;
  version: string;
  updatedAt: string;
}

const CONTENT_DIR = path.resolve(import.meta.dir, "../../content");

const CONTENT_TITLES: Record<ContentSlug, string> = {
  help: "帮助中心",
  about: "关于 YEHEY",
  privacy: "隐私政策",
  "user-agreement": "用户协议",
};

function getContentFilePath(slug: ContentSlug) {
  return path.join(CONTENT_DIR, `${slug}.md`);
}

function splitMarkdown(markdown: string, slug: ContentSlug) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const title = firstLine.startsWith("# ") ? firstLine.slice(2).trim() : CONTENT_TITLES[slug];
  const body = firstLine.startsWith("# ")
    ? lines.slice(1).join("\n").trim()
    : normalized;

  return {
    title: title || CONTENT_TITLES[slug],
    body,
  };
}

function readGitUpdatedAt(filePath: string) {
  const updatedAtResult = Bun.spawnSync({
    cmd: ["git", "log", "-n", "1", "--format=%cI", "--", filePath],
    stderr: "ignore",
    stdout: "pipe",
  });

  if (updatedAtResult.exitCode !== 0) {
    return "";
  }

  return new TextDecoder().decode(updatedAtResult.stdout).trim();
}

export async function readContentPage(slug: ContentSlug): Promise<ContentPageRecord | null> {
  const filePath = getContentFilePath(slug);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  const [markdown, fileStat] = await Promise.all([file.text(), stat(filePath)]);
  const { title, body } = splitMarkdown(markdown, slug);
  const gitUpdatedAt = readGitUpdatedAt(filePath);
  const fallbackUpdatedAt = fileStat.mtime.toISOString();

  return {
    slug,
    title,
    body,
    version: gitUpdatedAt || fallbackUpdatedAt,
    updatedAt: gitUpdatedAt || fallbackUpdatedAt,
  };
}
