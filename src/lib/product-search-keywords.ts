const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "in",
  "on",
  "at",
  "to",
  "of",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "our",
  "your",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "from",
  "by",
  "as",
  "not",
  "no",
  "but",
  "if",
  "than",
  "then",
  "so",
  "very",
  "just",
  "about",
  "into",
  "over",
  "after",
  "before",
  "between",
  "under",
  "again",
  "further",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "also",
  "per",
  "via",
  "pk",
  "pakistan",
  "buy",
  "online",
  "shop",
  "store",
  "price",
  "sale",
]);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ");
}

function tokenize(text: string): string[] {
  return text.split(/[^a-zA-Z0-9\u0600-\u06FF]+/).filter((w) => w.length >= 2);
}

export type ProductSearchKeywordInput = {
  name: string;
  slug: string;
  shortDescription: string;
  description?: string;
  tagLabels: string[];
  skus: string[];
  /** Admin manual extras (comma / newline separated). */
  extra?: string;
};

/** Build a rich comma-separated keyword string for storefront search. */
export function buildProductSearchKeywords(input: ProductSearchKeywordInput): string {
  const bag = new Set<string>();

  const add = (raw: string) => {
    const s = raw.trim().toLowerCase();
    if (s.length >= 2) bag.add(s);
  };

  const addText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length >= 2) add(trimmed);
    for (const w of tokenize(text)) {
      if (w.length >= 2 && !STOP_WORDS.has(w)) add(w);
    }
  };

  addText(input.name);
  addText(input.slug.replace(/-/g, " "));

  const nameParts = tokenize(input.name);
  for (let i = 0; i < nameParts.length - 1; i++) {
    add(`${nameParts[i]} ${nameParts[i + 1]}`);
  }

  for (const tag of input.tagLabels) addText(tag);

  for (const sku of input.skus) {
    const s = sku.trim();
    if (!s) continue;
    add(s);
    for (const part of s.split(/[-_./]/)) {
      if (part.length >= 2) add(part);
    }
  }

  addText(stripHtml(input.shortDescription));
  addText(stripHtml(input.description ?? ""));

  if (input.extra) {
    for (const part of input.extra.split(/[,;\n]+/)) addText(part);
  }

  return Array.from(bag).join(", ");
}
