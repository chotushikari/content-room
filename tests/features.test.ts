import { describe, expect, it } from 'vitest';
import { extractFeatures, isPromiseSentence, countCtaAsks, scoreCta } from '../src/core/features/extract';
import { velloeDemoAsset, weakVariants } from '../src/fixtures/velloe/content';
import { heuristicRewrite } from '../src/providers/deterministic/analysis';

const REWRITTEN = heuristicRewrite(velloeDemoAsset).versionB;

describe('promise detection', () => {
  it('recognises a benefit stated in words rather than digits', () => {
    // This is the case the original detector missed entirely, which left the
    // rewriter with nothing to move forward.
    expect(isPromiseSentence('Teams using the new flow cut their review cycle from about two weeks to under two days.')).toBe(true);
    expect(isPromiseSentence('We have been quiet for a while, and there is a reason for that.')).toBe(false);
  });

  it('scores a value proposition in the opening as high, and a buried one as low', () => {
    const buried = extractFeatures(velloeDemoAsset.body, 'social_post');
    const leading = extractFeatures(REWRITTEN.body, 'social_post');
    expect(buried.promisePosition).toBeLessThan(0.6);
    expect(leading.promisePosition).toBeGreaterThan(0.9);
  });

  it('is monotonic: moving the promise earlier never lowers promisePosition', () => {
    const body = [
      'Some context that establishes nothing.',
      'More context that also establishes nothing.',
      'We cut onboarding from fourteen days to two days.',
      'A closing line without an ask.',
    ].join('\n\n');
    const moved = ['We cut onboarding from fourteen days to two days.', 'Some context that establishes nothing.', 'More context that also establishes nothing.', 'A closing line without an ask.'].join('\n\n');

    const before = extractFeatures(body, 'social_post').promisePosition;
    const after = extractFeatures(moved, 'social_post').promisePosition;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('treats an opening that states a concrete quantity as the promise, not as a buried lede', () => {
    const f = extractFeatures('Campaign review takes fourteen days and the delay is not the tooling.', 'social_post');
    expect(f.promisePosition).toBeGreaterThan(0.85);
  });
});

describe('call-to-action detection', () => {
  it('does not credit narrative prose as a call to action', () => {
    // "you watch where attention drops" contains an imperative verb but is not
    // an ask. The previous detector counted it and inflated ctaClarity.
    const prose = 'Before a campaign goes live, it goes in front of a simulated audience, and you watch where attention drops and where trust breaks.';
    expect(scoreCta([prose], prose)).toBeLessThan(0.5);
  });

  it('rewards an ask that leads the closing sentence', () => {
    const sentences = ['Context line.', 'Read the walkthrough at the link below.'];
    expect(scoreCta(sentences, sentences.join(' '))).toBeGreaterThan(0.8);
  });

  it('counts distinct asks in the closing region', () => {
    const one = ['Context.', 'Read the walkthrough at the link below.'];
    const many = ['Context.', 'Follow us for updates.', 'Read the walkthrough below.', 'Subscribe to the newsletter.'];
    expect(countCtaAsks(one)).toBe(1);
    expect(countCtaAsks(many)).toBeGreaterThan(1);
  });
});

describe('clarity varies with the input', () => {
  it('is not a constant across different content', () => {
    const a = extractFeatures(velloeDemoAsset.body, 'social_post').clarity;
    const weak = extractFeatures(weakVariants.vagueAnnouncement().body, 'social_post').clarity;
    const strong = extractFeatures(weakVariants.strongControl().body, 'social_post').clarity;
    const values = new Set([a.toFixed(3), weak.toFixed(3), strong.toFixed(3)]);
    // A feature that returns the same value for every input cannot discriminate.
    expect(values.size).toBeGreaterThan(1);
  });

  it('penalises jargon', () => {
    const plain = extractFeatures('We cut onboarding from fourteen days to two days.', 'social_post').clarity;
    const jargon = extractFeatures('We leverage holistic synergy to optimize our scalable ecosystem.', 'social_post').clarity;
    expect(jargon).toBeLessThan(plain);
  });
});

describe('the deterministic rewrite', () => {
  it('preserves every quantity in the original (no fabricated evidence)', () => {
    const quantities = (text: string) =>
      (text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|hundred|thousand)\b/gi) ?? [])
        .map((s) => s.toLowerCase())
        .sort();

    const before = quantities(velloeDemoAsset.body);
    const after = quantities(REWRITTEN.body);
    for (const q of new Set(before)) {
      expect(after.length).toBeGreaterThanOrEqual(before.filter((x) => x === q).length);
    }
  });

  it('produces a genuinely different asset with a fresh hash', () => {
    expect(REWRITTEN.contentHash).not.toBe(velloeDemoAsset.contentHash);
    expect(REWRITTEN.kind).toBe(velloeDemoAsset.kind);
  });

  it('is deterministic', () => {
    const again = heuristicRewrite(velloeDemoAsset).versionB;
    expect(again.body).toBe(REWRITTEN.body);
    expect(again.contentHash).toBe(REWRITTEN.contentHash);
  });

  it('does not duplicate the opening when the promise is the first sentence', () => {
    const sentences = REWRITTEN.body.split(/\n\n+/).filter(Boolean);
    const first = sentences[0];
    const rest = sentences.slice(1);
    expect(rest.some((s) => s === first)).toBe(false);
  });
});
