import { lookup } from 'node:dns/promises';
import type { ContentAsset, Platform } from '../core/domain';
import { computeContentHash, contentAssetId } from '../core/ids';
import { extractArticle, shouldExtractArticle } from './article';

/**
 * Content ingestion.
 *
 * The honest position (docs/research.md §5): universal scraping does not exist.
 * Instagram, LinkedIn and Facebook require app review plus tokens; X oEmbed
 * returns a blockquote and nothing else. So importers here resolve METADATA
 * ONLY, and when that is all they get they return `partial: true` rather than
 * pretending to have the content. The manual paste path is a first-class source,
 * not an error state.
 *
 * This module is the security boundary. A user-supplied URL fetched server-side
 * is the classic SSRF vector, and Vercel provides no guard.
 */

export class UrlBlockedError extends Error {
  readonly code = 'URL_BLOCKED' as const;
  constructor() {
    // Deliberately generic: URL_BLOCKED and IMPORT_FAILED must be
    // indistinguishable to the caller so this cannot be used as a network probe.
    super('That link could not be read.');
    this.name = 'UrlBlockedError';
  }
}

export class ImportFailedError extends Error {
  readonly code = 'IMPORT_FAILED' as const;
  constructor() {
    super('That link could not be read.');
    this.name = 'ImportFailedError';
  }
}

// ---------------------------------------------------------------------------
// Address validation (hand-rolled: no runtime dependency, and we own the logic)
// ---------------------------------------------------------------------------

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isBlockedIpv4(ip: string): boolean {
  const o = parseIpv4(ip);
  if (!o) return false;
  const [a, b] = o as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud IMDS
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0] ?? ip;
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fe80')) return true; // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
  if (v.startsWith('ff')) return true; // multicast
  // IPv4-mapped ::ffff:a.b.c.d
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);
  // Also treat hex-encoded IPv4-mapped forms conservatively.
  if (v.startsWith('::ffff:')) return true;
  return false;
}

function isBlockedAddress(ip: string): boolean {
  return ip.includes(':') ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

/**
 * Validate a user-supplied URL.
 * Returns the parsed URL on success; throws UrlBlockedError otherwise.
 */
export async function assertUrlSafe(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlBlockedError();
  }

  // Scheme allowlist. Rejects file:, gopher:, data:, ftp:, dict:, ...
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UrlBlockedError();

  // Embedded credentials are a parser-disagreement vector.
  if (url.username || url.password) throw new UrlBlockedError();

  // Zone identifiers and percent-encoded hosts.
  if (raw.includes('\u200b') || raw.includes('\u202e') || /[\u2000-\u200f]/.test(raw)) {
    throw new UrlBlockedError();
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) throw new UrlBlockedError();

  // Non-standard ports are refused. A homoglyph or zero-width hostname will
  // simply fail DNS below, but reject obviously local names up front.
  if (url.port && !['80', '443', '8080'].includes(url.port)) throw new UrlBlockedError();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new UrlBlockedError();
  }

  // Bare IP literal.
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    const bare = hostname.replace(/^\[|\]$/g, '');
    if (isBlockedAddress(bare)) throw new UrlBlockedError();
    return url;
  }

  // Resolve ALL A and AAAA records and validate every one, so a hostname that
  // resolves to a private address is refused before any connection is made.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new ImportFailedError();
  }
  if (addresses.length === 0) throw new ImportFailedError();
  for (const a of addresses) {
    if (isBlockedAddress(a.address)) throw new UrlBlockedError();
  }

  return url;
}

// ---------------------------------------------------------------------------
// Metadata-only extraction (no headless browser, no scraping of post bodies)
// ---------------------------------------------------------------------------

/**
 * Metadata extraction.
 *
 * Implemented as a small attribute parser rather than a list of regexes, because
 * the regex approach broke on real pages: it required `name` to appear before
 * `content`, so a page with the attributes in the other order silently yielded an
 * empty description. Wikipedia — one of the most predictable sites on the web —
 * came back with a title and no body at all.
 */

type MetaResult = {
  title?: string;
  description?: string;
  image?: string;
  /** Alt text. The only part of an image we can read without a vision model. */
  imageAlt?: string;
  author?: string;
  siteName?: string;
};

type MetaTag = Record<string, string>;

function parseMetaTags(html: string): MetaTag[] {
  const tags: MetaTag[] = [];
  const tagRe = /<meta\b([^>]*)>/gi;
  const attrRe = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(html)) !== null) {
    const attrs = tagMatch[1] ?? '';
    const record: MetaTag = {};
    let attrMatch: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((attrMatch = attrRe.exec(attrs)) !== null) {
      const key = (attrMatch[1] ?? '').toLowerCase();
      const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      if (key) record[key] = value;
    }
    if (Object.keys(record).length > 0) tags.push(record);
  }
  return tags;
}

/** Strip characters that have no business being in a title or description. */
function sanitize(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  middot: '·',
  laquo: '«',
  raquo: '»',
};

/**
 * Decode HTML entities, including NUMERIC references.
 *
 * The previous version only handled a handful of named entities, so a Facebook
 * page rendered its description into the UI as raw `&#x92a;&#x930;` escapes.
 */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]{1,6});/gi, (whole, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? safeFromCodePoint(code) : whole;
    })
    .replace(/&#(\d{1,7});/g, (whole, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? safeFromCodePoint(code) : whole;
    })
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function extractMetadata(html: string): MetaResult {
  const tags = parseMetaTags(html);
  const out: MetaResult = {};

  /**
   * Find a meta value by its identifier, honouring the given order of preference.
   *
   * The identifier lives in `property`, `name` or `itemprop` depending on the
   * page, and the value always lives in `content`. Looking the identifier up as
   * if it were a key — which the first version of this parser did — matched
   * nothing at all and silently produced empty descriptions on every site.
   */
  const find = (keys: string[]): string | undefined => {
    for (const key of keys) {
      for (const tag of tags) {
        const identifier = (tag['property'] ?? tag['name'] ?? tag['itemprop'] ?? '').toLowerCase();
        if (identifier !== key) continue;
        const raw = tag['content'] ?? tag['value'] ?? '';
        if (!raw.trim()) continue;
        const value = sanitize(decodeEntities(raw)).slice(0, 500);
        if (value) return value;
      }
    }
    return undefined;
  };

  out.title = find(['og:title', 'twitter:title']) ?? extractTitleTag(html);
  out.description = find(['og:description', 'twitter:description', 'description']);
  out.image = find(['og:image', 'og:image:url', 'twitter:image']);
  out.imageAlt = find(['og:image:alt', 'twitter:image:alt']);
  out.author = find(['article:author', 'author', 'og:article:author']);
  out.siteName = find(['og:site_name', 'application-name']);

  return out;
}

function extractTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = match?.[1];
  if (!raw) return undefined;
  const value = sanitize(decodeEntities(raw)).slice(0, 500);
  return value || undefined;
}

function platformFor(hostname: string): Platform {
  const h = hostname.replace(/^www\./, '');
  if (h.includes('instagram')) return 'instagram';
  if (h.includes('linkedin')) return 'linkedin';
  if (h === 'x.com' || h.includes('twitter') || h === 't.co') return 'x';
  if (h.includes('youtube') || h === 'youtu.be') return 'youtube';
  if (h.includes('tiktok')) return 'tiktok';
  if (h.includes('threads.net')) return 'x';
  if (h.includes('vimeo')) return 'vimeo';
  if (h.includes('spotify')) return 'spotify';
  if (h.includes('facebook') || h === 'fb.com') return 'facebook';
  if (h.includes('reddit')) return 'web';
  return 'web';
}

const MAX_BYTES = Number(process.env.CONTENT_ROOM_MAX_RESPONSE_BYTES ?? 2_000_000);
const TIMEOUT_MS = Number(process.env.CONTENT_ROOM_FETCH_TIMEOUT_MS ?? 8000);
const ALLOWED_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain', 'application/json'];

/** Read a response body with a hard size cap, so a 50MB page cannot be buffered. */
async function readCapped(response: Response, cap: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > cap) throw new ImportFailedError();

  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new ImportFailedError();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function fetchWithRedirects(url: URL): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Identify honestly rather than impersonating a browser.
        'user-agent': 'ContentRoomBot/0.1 (+rehearsal metadata reader)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new ImportFailedError();
      // Every hop is re-validated from scratch, so a redirect cannot be used to
      // reach a private address that the original URL did not point at.
      current = await assertUrlSafe(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new ImportFailedError();

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!ALLOWED_TYPES.includes(contentType)) throw new ImportFailedError();

    return response;
  }
  throw new ImportFailedError();
}

export type ImportResult = {
  asset: ContentAsset;
  /** Human-readable note shown in the UI when only metadata resolved. */
  note?: string;
};

/**
 * Platforms where server-side reading does not work.
 *
 * Two different reasons, treated the same way because the user experience is
 * identical — paste the content and we will take it from there:
 *
 *  1. TERMS. Instagram, LinkedIn and Facebook prohibit automated reading
 *     outright, so we do not request the page at all.
 *
 *  2. BROKEN. X/Twitter, TikTok and Threads serve a JavaScript shell or a bot
 *     block to non-browser requests. Verified against the live endpoints: an
 *     x.com post URL returns HTTP 404 even for the official oEmbed endpoint, and
 *     TikTok's oEmbed returns an HTML block page instead of JSON. Attempting the
 *     fetch produces either a hard failure or a few dozen characters of
 *     boilerplate, and both are worse than saying so plainly.
 *
 * The distinction matters for honesty: for group 1 nothing was requested, and
 * for group 2 the platform refused. The note says which.
 */
const REFUSED_PLATFORMS = new Set<Platform>([
  'instagram',
  'linkedin',
  'facebook',
  // x covers both x.com and threads.net — see platformFor.
  'x',
  'tiktok',
]);

const TERMS_PLATFORMS = new Set<Platform>(['instagram', 'linkedin', 'facebook']);

function refusedNote(platform: Platform): string {
  return TERMS_PLATFORMS.has(platform)
    ? `${platform} does not permit automated reading, so we did not request the page. Paste the post text below and we will analyse it properly.`
    : `${platform} only serves posts to a logged-in browser, so we could not read it. Paste the post text below and we will analyse it properly.`;
}

/**
 * An asset with no readable content, used whenever the import could not resolve
 * text. Marked `partial` so the interface offers the paste path prominently
 * instead of presenting an empty analysis as a result.
 */
function emptyAsset(url: URL, platform: Platform, reason: string): ContentAsset {
  const base = {
    kind: kindForPlatform(platform),
    source: { type: 'url' as const, url: url.toString(), platform },
    title: '',
    body: '',
    media: [],
    meta: { platform, unreadable: reason },
    partial: true,
    importedBy: `${platform}-unreadable-importer`,
  };
  const hash = computeContentHash(base);
  return { ...base, id: contentAssetId(hash, base.kind), contentHash: hash };
}

export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  const url = await assertUrlSafe(rawUrl);
  const platform = platformFor(url.hostname);

  // Refuse before making any request.
  if (REFUSED_PLATFORMS.has(platform)) {
    return {
      asset: emptyAsset(url, platform, 'refused'),
      note: refusedNote(platform),
    };
  }

  let html: string;
  try {
    const response = await fetchWithRedirects(url);
    html = await readCapped(response, MAX_BYTES);
  } catch (error) {
    // An SSRF rejection stays a hard error — that is a security decision, not a
    // content problem.
    if (error instanceof UrlBlockedError) throw error;

    // Anything else — 403, 404, timeout, unsupported content type, a size cap —
    // degrades to the paste path rather than failing the run. The user came here
    // to rehearse their content, and a link we cannot read is not a reason to
    // give them nothing. Only the mechanism changes.
    return {
      asset: emptyAsset(url, platform, 'unreadable'),
      note: 'We could not read that page. Paste the text below and we will analyse it properly.',
    };
  }

  const meta = extractMetadata(html);
  const kind = kindForPlatform(platform);

  let body = [
    meta.description,
    // Marked as a description rather than passed off as the author's own words,
    // so the analysis can use it without the DNA mistaking it for the post text.
    meta.imageAlt ? `[Image description: ${meta.imageAlt}]` : '',
    meta.author ? `By ${meta.author}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2000);

  let extracted: { title?: string; byline?: string } = {};

  // Second stage, lazily: when metadata gave us almost nothing and this looks
  // like an article, read the actual page text. This is what turns a title-only
  // import into something the analysis can work with.
  if (shouldExtractArticle(body.length, kind)) {
    const article = await extractArticle(html);
    if (article && article.text.length > body.length) {
      body = article.text.slice(0, 19_000);
      extracted = { title: article.title, byline: article.byline };
    }
  }

  const base = {
    kind,
    source: { type: 'url' as const, url: url.toString(), platform },
    title: (meta.title ?? extracted.title ?? '').slice(0, 300),
    body,
    media: meta.image ? [{ kind: 'image' as const, url: meta.image }] : [],
    meta: Object.fromEntries(
      Object.entries({
        ...meta,
        ...(extracted.byline ? { byline: extracted.byline } : {}),
      }).filter(([, v]) => typeof v === 'string') as Array<[string, string]>,
    ),
    // Metadata plus, where available, the article body. The post body for a
    // social platform is not available through any sanctioned free path, so a
    // metadata-only result is a NORMAL state, not a failure.
    partial: body.length < 400,
    importedBy: `${platform}-metadata-importer`,
  };
  const hash = computeContentHash(base);

  return {
    asset: { ...base, id: contentAssetId(hash, base.kind), contentHash: hash },
    note:
      base.partial
        ? 'We could not read much from that page. Paste the content and we will take it from there.'
        : 'We read the page text, not the original post. Paste the exact wording for a sharper read.',
  };
}

/**
 * Infer the content kind from where it came from.
 *
 * A YouTube link is a video, a Vimeo link is a video, a generic page is an
 * article. Importing everything as a social post made the DNA analysis judge a
 * blog page by the wrong length norms.
 */
function kindForPlatform(platform: Platform): ContentAsset['kind'] {
  if (platform === 'youtube' || platform === 'vimeo' || platform === 'tiktok') return 'video';
  if (platform === 'spotify') return 'brand_message';
  return 'article';
}

export function importFromManual(input: {
  kind: ContentAsset['kind'];
  title: string;
  body: string;
}): ImportResult {
  const base = {
    kind: input.kind,
    source: { type: 'manual' as const },
    title: input.title.slice(0, 300),
    body: input.body.slice(0, 20_000),
    media: [],
    meta: {},
    partial: false,
    importedBy: 'manual-content-importer',
  };
  const hash = computeContentHash(base);
  return { asset: { ...base, id: contentAssetId(hash, base.kind), contentHash: hash } };
}
