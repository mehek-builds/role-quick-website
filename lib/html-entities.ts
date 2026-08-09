const NAMED_TEXT_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  mdash: "-",
  nbsp: " ",
  ndash: "-",
  quot: '"',
};

/** Decode entities from scraped posting text without ever rendering it as HTML. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, rawEntity: string) => {
    const entity = rawEntity.toLowerCase();
    if (entity in NAMED_TEXT_ENTITIES) return NAMED_TEXT_ENTITIES[entity];

    const codePoint = entity.startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : entity.startsWith("#")
        ? Number.parseInt(entity.slice(1), 10)
        : Number.NaN;
    if (!Number.isInteger(codePoint) || codePoint < 32 || codePoint > 0x10ffff) return original;
    if (codePoint === 8211 || codePoint === 8212) return "-";
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return original;
    }
  });
}
