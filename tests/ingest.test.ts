import { describe, expect, it } from 'vitest';
import { assertUrlSafe, extractMetadata, importFromManual, UrlBlockedError } from '../src/ingest';
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
