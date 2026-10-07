// The old admin saved descriptions as HTML from a rich-text box. The new system keeps plain text:
// paragraphs become lines, list items become bullet lines, and everything else is dropped.

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", deg: "°", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
};

const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);

export const looksLikeHtml = (text: string) => /<\/?[a-z][a-z0-9]*\b[^>]*>|&[a-z]+;|&#\d+;/i.test(text);

/** Turns saved HTML into readable plain text. Text without HTML comes back unchanged apart from tidied spacing. */
export const htmlToText = (html: string | null | undefined): string | null => {
  if (html === null || html === undefined) return null;
  if (!looksLikeHtml(html)) return html.trim() || null;

  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|table|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line !== "•") // list items that were empty
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return tidyBullets(text) || null;
};

/** Bullet lines that follow each other sit on consecutive lines, without a blank line between them. */
export const tidyBullets = (text: string) => text.replace(/^(• [^\n]*)\n\n(?=• )/gm, "$1\n");
