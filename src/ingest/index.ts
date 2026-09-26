import { lookup } from 'node:dns/promises';
import type { ContentAsset, Platform } from '../core/domain';
import { computeContentHash, contentAssetId } from '../core/ids';

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

const META_PATTERNS: Array<[keyof MetaResult | 'title', RegExp]> = [
  ['title', /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i],
  ['title', /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i],
  ['title', /<title[^>]*>([^<]*)<\/title>/i],
  ['description', /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i],
  ['description', /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i],
  ['image', /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i],
  ['author', /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']*)["']/i],
  ['siteName', /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i],
];

type MetaResult = {
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  siteName?: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function extractMetadata(html: string): MetaResult {
  const out: MetaResult = {};
  for (const [key, pattern] of META_PATTERNS) {
    if (out[key as keyof MetaResult]) continue;
    const m = html.match(pattern);
    const captured = m?.[1];
    if (captured && captured.trim()) {
      (out as Record<string, string>)[key as string] = decodeEntities(captured.trim()).slice(0, 500);
    }
  }
  return out;
}

function platformFor(hostname: string): Platform {
  const h = hostname.replace(/^www\./, '');
  if (h.includes('instagram')) return 'instagram';
  if (h.includes('linkedin')) return 'linkedin';
  if (h === 'x.com' || h.includes('twitter')) return 'x';
  if (h.includes('youtube') || h === 'youtu.be') return 'youtube';
  if (h.includes('tiktok')) return 'tiktok';
  if (h.includes('vimeo')) return 'vimeo';
  if (h.includes('spotify')) return 'spotify';
  if (h.includes('facebook')) return 'facebook';
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

export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  const url = await assertUrlSafe(rawUrl);
  const platform = platformFor(url.hostname);

  let html: string;
  try {
    const response = await fetchWithRedirects(url);
    html = await readCapped(response, MAX_BYTES);
  } catch (error) {
    if (error instanceof UrlBlockedError) throw error;
    throw new ImportFailedError();
  }

  const meta = extractMetadata(html);
  const body = [meta.description, meta.author ? `By ${meta.author}.` : '']
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2000);

  const base = {
    kind: 'social_post' as const,
    source: { type: 'url' as const, url: url.toString(), platform },
    title: meta.title ?? '',
    body,
    media: meta.image ? [{ kind: 'image' as const, url: meta.image }] : [],
    meta: Object.fromEntries(
      Object.entries(meta).filter(([, v]) => typeof v === 'string') as Array<[string, string]>,
    ),
    // Metadata only. The post body itself is not available through any
    // sanctioned free path, so this is a NORMAL state, not a failure.
    partial: true,
    importedBy: `${platform}-metadata-importer`,
  };
  const hash = computeContentHash(base);

  const supported = platform !== 'instagram' && platform !== 'linkedin' && platform !== 'facebook';

  return {
    asset: { ...base, id: contentAssetId(hash, base.kind), contentHash: hash },
    note: platform === 'linkedin' || platform === 'instagram' || platform === 'facebook'
      ? `${platform} does not permit automated reading, so nothing was extracted. Paste the content and we will take it from there.`
      : supported && meta.title
        ? 'We read the headline and thumbnail only. Paste the caption text for a sharper rehearsal.'
        : 'We could not read that page. Paste the content and we will take it from there.',
  };
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
