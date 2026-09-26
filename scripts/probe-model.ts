/**
 * Model probe — a development tool, not part of the product runtime.
 *
 * Prints the deterministic model's inputs and gate probabilities for the demo
 * fixture, Version B, and the weak/strong control variants. This is how the
 * coefficients are inspected and checked for sensitivity, rather than tuning
 * them by staring at the demo output until it looks good.
 *
 *   npx tsx scripts/probe-model.ts
 *
 * Use it to answer: "is the model actually discriminating, or is it a rubber
 * stamp?" If the strong variant does not clearly beat the weak one on attention
 * and positive response, the model is broken.
 */

import { extractFeatures } from '../src/core/features/extract';
import {
  heuristicDNA,
  heuristicRewrite,
  heuristicSegments,
} from '../src/providers/deterministic/analysis';
import { buildAudience } from '../src/core/audience/factory';
import {
  frictionDrag,
  interestFit,
  pEngage,
  pKeepAttention,
  pPositive,
} from '../src/engines/deterministic/model';
import { velloeDemoAsset, weakVariants } from '../src/fixtures/velloe/content';
import type { ContentAsset } from '../src/core/domain';

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const f3 = (n: number) => n.toFixed(3);

function report(name: string, asset: ContentAsset): void {
  const f = extractFeatures(asset.body, asset.kind);
  const dna = heuristicDNA(asset);
  const segments = heuristicSegments(asset, dna, 24);
  const audience = buildAudience({
    dna,
    segments,
    size: 24,
    audienceSeed: 'probe-seed',
    producedBy: 'probe',
  });

  const keep: number[] = [];
  const positive: number[] = [];
  const engage: number[] = [];
  const fits: number[] = [];

  for (const agent of audience.agents) {
    const it = interestFit(f, agent.traits, agent.interests);
    fits.push(it);
    const p = pKeepAttention(f, agent.traits, it);
    keep.push(p);
    const pos = pPositive(f, agent.traits, dna, it);
    positive.push(pos);
    engage.push(pEngage(f, agent.traits, pos));
  }

  process.stdout.write(`\n=== ${name} ===\n`);
  process.stdout.write(
    `features  hook=${f3(f.hookStrength)} clarity=${f3(f.clarity)} promise=${f3(f.promisePosition)} cta=${f3(f.ctaClarity)} proof=${f3(f.proofPresence)} emotion=${f3(f.emotionalCharge)} length=${f3(f.lengthPenalty)}\n`,
  );
  process.stdout.write(
    `frictions ${dna.potentialFrictions.map((x) => x.label).join(' | ') || '(none)'}\n`,
  );
  process.stdout.write(`drag=${f3(frictionDrag(dna))}\n`);
  process.stdout.write(
    `mean      interest=${f3(mean(fits))} pKeep=${f3(mean(keep))} pPositive=${f3(mean(positive))} pEngage=${f3(mean(engage))}\n`,
  );
  process.stdout.write(`opening   "${f.firstSentence.slice(0, 110)}"\n`);
}

report('VELLOE — Version A (as published)', velloeDemoAsset);
report('VELLOE — Version B (rewritten)', heuristicRewrite(velloeDemoAsset).versionB);
report('CONTROL — deliberately weak', weakVariants.vagueAnnouncement());
report('CONTROL — deliberately strong', weakVariants.strongControl());
