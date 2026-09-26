/**
 * Lazy article extraction.
 *
 * The metadata path (OpenGraph, Twitter cards, JSON-LD) is cheap and covers most
 * landing pages, ads and social posts. But some of the most valuable content to
 * rehearse is a full article, and plenty of sites — Wikipedia being the clearest
 * example — ship no meta description at all. Testing showed Wikipedia returning a
 * title and an empty body, which produces a useless Content DNA.
 *
 * So this module is the second stage, and it is imported LAZILY. `linkedom` plus
 * Readability costs real bytes, and loading it on the common path would slow down
 * every import to help a minority of them.
 *
 * `jsdom` is deliberately not used: 7 MB and 665 files for the same job, where
 * `linkedom` is under 1 MB.
 */

export type ArticleExtraction = {
  text: string;
  title?: string;
  byline?: string;
  excerpt?: string;
};

/**
 * A hidden "short description" element, used by Wikipedia and other MediaWiki
 * and news sites to hold the search-snippet summary. It is visually hidden but
 * present in the HTML, and it is often the single best sentence on the page.
 */
function hiddenShortDescription(html: string): string | undefined {
  const match = html.match(
    /<(?:div|span|p)[^>]*class="[^"]*shortdescription[^"]*"[^>]*>([\s\S]{20,600}?)<\/(?:div|span|p)>/i,
  );
  const raw = match?.[1];
  if (!raw) return undefined;
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length >= 20 ? text : undefined;
}

/**
 * Fraction of the extracted text that sits inside links.
 *
 * This is the discriminator that actually works, and it took measurement to find.
 * A first attempt scored prose by sentence punctuation and average word length,
 * which could not tell the two failure modes apart: bbc.com/news returned 6,800
 * characters of navigation ("Skip to contentBritish Broadcasting CorporationHome
 * NewsSportBusiness..."), while MDN returned 20,000 characters of documentation
 * that is mostly code. Measured terminator density was 1.3 per 1,000 characters
 * for BOTH, and MDN's average word length was 38 because `fetch('/api')` counts
 * as one "word".
 *
 * Link density separates them cleanly and has an obvious meaning: a page that is
 * mostly links is an index, not an article. Real articles sit near 5-15%.
 */
function linkDensity(htmlFragment: string): number {
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const total = strip(htmlFragment);
  if (total.length === 0) return 1;
  const linkText = strip(
    (htmlFragment.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []).join(' '),
  );
  return linkText.length / total.length;
}

/** Above this, the "article" is an index or a menu rather than content. */
const MAX_LINK_DENSITY = 0.45;

/**
 * Extract the readable article body.
 *
 * Returns null rather than throwing when extraction fails: a page that cannot be
 * read is a normal outcome, and the caller falls back to metadata only.
 */
export async function extractArticle(html: string): Promise<ArticleExtraction | null> {
  // Cheap win first, before paying for a DOM.
  const short = hiddenShortDescription(html);

  try {
    const [{ parseHTML }, { Readability }] = await Promise.all([
      import('linkedom'),
      import('@mozilla/readability'),
    ]);

    const { document } = parseHTML(html);
    // Readability resolves relative links against the base URI; without one it
    // can throw on pages that use relative hrefs.
    const reader = new Readability(document as unknown as Document, {
      charThreshold: 200,
      keepClasses: false,
    });
    const article = reader.parse();

    const text = (article?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\[\d+\]\s*/g, ' ') // Wikipedia-style citation markers
      .trim();

    const density = linkDensity(article?.content ?? '');

    if (text.length >= 200 && density <= MAX_LINK_DENSITY) {
      return {
        text: text.slice(0, 12_000),
        title: article?.title?.trim() || undefined,
        byline: article?.byline?.trim() || undefined,
        excerpt: article?.excerpt?.trim() || short || undefined,
      };
    }

    // Readability found too little, or found an index rather than an article.
    // The hidden summary is a far better input than a menu, and is short enough
    // that marking the import partial is honest.
    if (short) return { text: short.slice(0, 2_000) };
    return null;
  } catch {
    return short ? { text: short.slice(0, 2_000) } : null;
  }
}

/**
 * Whether a fetch result is worth a second pass.
 *
 * Only when the metadata body is thin AND the page is plausibly an article. A
 * social post will never yield article text, so paying for a DOM there is waste.
 */
export function shouldExtractArticle(bodyChars: number, contentType: string): boolean {
  return contentType === 'article' && bodyChars < 400;
}
