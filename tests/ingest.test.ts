import { describe, expect, it } from 'vitest';
import {
  assertUrlSafe,
  decodeEntities,
  extractMetadata,
  importFromManual,
  importFromUrl,
  UrlBlockedError,
} from '../src/ingest';
import { extractArticle } from '../src/ingest/article';
import { computeContentHash } from '../src/core/ids';

/**
 * Security boundary tests.
 *
 * A user-supplied URL fetched server-side is the classic SSRF vector, and Vercel
 * provides no guard. None of these cases performs a network call: IP literals are
 * rejected before DNS, and the one hostname case is rejected as a literal name.
 */

describe('URL validation', () => {
  const blocked = [
    // Loopback and private ranges
    'http://127.0.0.1/',
    'http://127.0.0.1:3000/admin',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://224.0.0.1/',
    // IPv6 forms, including IPv4-mapped
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/',
    'http://[fc00::1]/',
    // Non-HTTP schemes
    'file:///etc/passwd',
    'gopher://127.0.0.1/',
    'data:text/html,<h1>hi</h1>',
    'ftp://example.com/',
    // Credentials and local names
    'http://user:pass@example.com/',
    'http://localhost/',
    'http://something.local/',
    'http://service.internal/',
    // Garbage
    'not a url',
    '',
  ];

  it.each(blocked)('blocks %s', async (url) => {
    await expect(assertUrlSafe(url)).rejects.toBeInstanceOf(UrlBlockedError);
  });

  it('accepts an ordinary public https URL', async () => {
    // Uses an IP literal so the assertion is synchronous and needs no DNS.
    const parsed = await assertUrlSafe('https://93.184.216.34/article');
    expect(parsed.hostname).toBe('93.184.216.34');
  });
});

describe('no SSRF oracle', () => {
  it('gives blocked and failed requests the same message and code', async () => {
    // If these differed, the endpoint could be used to probe the internal
    // network by observing which failures were "blocked" versus "failed".
    const blockedError = await assertUrlSafe('http://127.0.0.1/').catch((e: Error) => e);
    const schemeError = await assertUrlSafe('file:///etc/passwd').catch((e: Error) => e);

    expect((blockedError as Error).message).toBe((schemeError as Error).message);
    expect((blockedError as Error).message).not.toContain('127.0.0.1');
    expect((blockedError as Error).message).not.toContain('file');
  });
});

describe('metadata extraction', () => {
  const html = `<!doctype html><html><head>
    <title>Plain title</title>
    <meta property="og:title" content="Velloe &amp; the review problem" />
    <meta property="og:description" content="A rehearsal step before publishing." />
    <meta property="og:image" content="https://example.com/x.png" />
    <meta name="twitter:title" content="ignored because og:title wins" />
    <meta property="og:site_name" content="LinkedIn" />
  </head><body>content</body></html>`;

  it('prefers og:title and decodes entities', () => {
    const meta = extractMetadata(html);
    expect(meta.title).toBe('Velloe & the review problem');
    expect(meta.description).toBe('A rehearsal step before publishing.');
    expect(meta.image).toBe('https://example.com/x.png');
    expect(meta.siteName).toBe('LinkedIn');
  });

  it('falls back to the title tag when no og:title exists', () => {
    const meta = extractMetadata('<html><head><title>Only a title</title></head></html>');
    expect(meta.title).toBe('Only a title');
  });

  it('returns nothing rather than inventing metadata', () => {
    expect(extractMetadata('<html><body>no head</body></html>')).toEqual({});
  });
});

describe('entity decoding', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &mdash; a study')).toBe('Tom & Jerry — a study');
  });

  it('decodes numeric decimal references', () => {
    expect(decodeEntities('caf&#233; &#8212; open')).toBe('café — open');
  });

  it('decodes numeric hex references', () => {
    // Facebook returned raw escapes like this into the UI before the fix.
    expect(decodeEntities('&#x92a;&#x930;')).toBe('\u092a\u0930');
  });

  it('leaves unknown entities alone rather than mangling them', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });

  it('strips zero-width and bidi characters that arrived entity-encoded', () => {
    // decodeEntities only decodes; stripping invisible characters is sanitize's
    // job, and extractMetadata applies both in that order so an ENCODED
    // zero-width space is decoded and then removed.
    const meta = extractMetadata('<meta name="description" content="safe&#x200b;text&#x202e;">');
    expect(meta.description).toBe('safetext');
  });
});

describe('metadata extraction is attribute-order independent', () => {
  // The original regex-based extractor required `name` to precede `content`, so
  // a page with the attributes the other way round yielded an empty description.
  // Wikipedia — one of the most predictable sites on the web — came back with a
  // title and no body at all.
  it('reads name-then-content', () => {
    const meta = extractMetadata('<meta name="description" content="first order">');
    expect(meta.description).toBe('first order');
  });

  it('reads content-then-name', () => {
    const meta = extractMetadata('<meta content="reversed order" name="description">');
    expect(meta.description).toBe('reversed order');
  });

  it('reads property-based tags in either order', () => {
    expect(extractMetadata('<meta property="og:title" content="A">').title).toBe('A');
    expect(extractMetadata('<meta content="B" property="og:title">').title).toBe('B');
  });

  it('accepts single-quoted and unquoted attributes', () => {
    expect(extractMetadata("<meta name='description' content='single'>").description).toBe('single');
    expect(extractMetadata('<meta name=description content=unquoted>').description).toBe('unquoted');
  });

  it('prefers og:title over twitter:title over the title tag', () => {
    const html = `<title>Tag title</title>
      <meta name="twitter:title" content="Twitter title">
      <meta property="og:title" content="Og title">`;
    expect(extractMetadata(html).title).toBe('Og title');
  });
});

describe('platforms that prohibit automated reading', () => {
  // Instagram, LinkedIn and Facebook are not fetched at all. Fetching them to
  // scrape a login wall would violate their terms and produce nothing useful.
  it.each([
    ['linkedin', 'https://www.linkedin.com/feed/'],
    ['instagram', 'https://www.instagram.com/p/CabcDEF/'],
    ['facebook', 'https://www.facebook.com/somepage'],
  ])('refuses %s without making a request', async (platform, url) => {
    const started = Date.now();
    const { asset, note } = await importFromUrl(url);
    const elapsed = Date.now() - started;

    expect(asset.importedBy).toBe(`${platform}-refused-importer`);
    expect(asset.partial).toBe(true);
    expect(asset.title).toBe('');
    // No network round-trip happened, so this is effectively instant.
    expect(elapsed).toBeLessThan(500);
    expect(note).toContain('does not permit automated reading');
    expect(note).toContain('did not request the page');
  });
});

describe('article extraction quality gate', () => {
  it('rejects a page that is mostly links, and accepts real prose', async () => {
    // This is the discriminator that took measurement to find. bbc.com/news
    // returned 6,800 characters of navigation and MDN returned 20,000 chars of
    // code, and their sentence punctuation was identical (1.3 per 1,000). Link
    // density separates them: an index is mostly links, an article is not.
    const navLinks = Array.from(
      { length: 60 },
      (_, i) => `<li><a href="/s${i}">Section ${i} News Sport Business Technology</a></li>`,
    ).join('');
    const navPage = `<html><body><nav><ul>${navLinks}</ul></nav><div id="content">${navLinks}</div></body></html>`;

    const navResult = await extractArticle(navPage);
    expect(navResult === null || navResult.text.length < 400).toBe(true);
  });

  it('accepts an article whose text is real prose', async () => {
    const paragraph =
      'The Fetch API provides an interface for fetching resources across the network. ' +
      'It is a more powerful and flexible replacement for XMLHttpRequest. ' +
      'A request is made, and a response is returned as a promise. '.repeat(6);
    const articlePage = `<html><body><article><h1>Fetch API</h1><p>${paragraph}</p></article></body></html>`;

    const result = await extractArticle(articlePage);
    expect(result).not.toBeNull();
    expect(result?.text.length).toBeGreaterThan(200);
  });

  it('never throws on malformed HTML', async () => {
    const result = await extractArticle('<html><body><p>unclosed <<< >></body>');
    expect(result === null || typeof result.text === 'string').toBe(true);
  });
});

describe('manual import', () => {
  it('marks pasted content as complete, not partial', () => {
    const { asset } = importFromManual({ kind: 'social_post', title: 'T', body: 'Body text.' });
    expect(asset.partial).toBe(false);
    expect(asset.importedBy).toBe('manual-content-importer');
  });

  it('produces a content hash that changes with the body', () => {
    const a = importFromManual({ kind: 'social_post', title: 'T', body: 'one' }).asset;
    const b = importFromManual({ kind: 'social_post', title: 'T', body: 'two' }).asset;
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('hashes deterministically for identical input', () => {
    const input = { kind: 'social_post' as const, title: 'T', body: 'same' };
    expect(importFromManual(input).asset.contentHash).toBe(importFromManual(input).asset.contentHash);
  });

  it('exposes a content hash helper that is stable', () => {
    const base = {
      kind: 'article' as const,
      source: { type: 'manual' as const },
      title: 'x',
      body: 'y',
      media: [],
      meta: {},
      partial: false,
      importedBy: 'manual',
    };
    expect(computeContentHash(base)).toBe(computeContentHash(base));
  });
});
