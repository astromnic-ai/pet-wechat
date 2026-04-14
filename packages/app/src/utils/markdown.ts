export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string };

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").trim();
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const source = normalizeMarkdown(markdown);
  if (!source) {
    return [];
  }

  const lines = source.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().slice(2).trim());
        index += 1;
      }
      blocks.push({
        type: "quote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];

      while (index < lines.length) {
        const nextLine = lines[index].trim();
        if (ordered && /^\d+\. /.test(nextLine)) {
          items.push(nextLine.replace(/^\d+\. /, "").trim());
          index += 1;
          continue;
        }
        if (!ordered && /^- /.test(nextLine)) {
          items.push(nextLine.slice(2).trim());
          index += 1;
          continue;
        }
        break;
      }

      blocks.push({
        type: "list",
        ordered,
        items,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index].trim();
      if (
        !nextLine ||
        /^(#{2,6})\s+/.test(nextLine) ||
        nextLine.startsWith("> ") ||
        /^- /.test(nextLine) ||
        /^\d+\. /.test(nextLine)
      ) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join("\n"),
    });
  }

  return blocks;
}
