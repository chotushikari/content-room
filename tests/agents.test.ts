import { describe, expect, it } from 'vitest';
import { deriveAgentProfiles, profileSummary, reactionPhrase, stateLabel } from '../src/core/agents';
import { buildAudience } from '../src/core/audience/factory';
import { deterministicEngine } from '../src/engines/deterministic/engine';
import { heuristicDNA, heuristicSegments } from '../src/providers/deterministic/analysis';
import { segmentIndexer, segmentColor } from '../src/components/room/palette';
import { velloeDemoAsset, weakVariants } from '../src/fixtures/velloe/content';
import type { AgentEvent, Audience } from '../src/core/domain';

async function run(asset = velloeDemoAsset) {
  const dna = heuristicDNA(asset);
  const audience: Audience = buildAudience({
    dna,
    segments: heuristicSegments(asset, dna, 24),
    size: 24,
    audienceSeed: 'agents-seed',
    producedBy: 'test',
  });
  const events: AgentEvent[] = [];
  for await (const e of deterministicEngine.run({
    runId: 'run_agents',
    asset,
    dna,
    audience,
    rounds: 3,
    seed: 11,
  })) {
    events.push(e);
  }
  return { audience, events, dna };
}

describe('agent profiles', () => {
  it('produces one profile per agent, with no one missing', async () => {
    const { audience, events } = await run();
    const profiles = deriveAgentProfiles({
      events,
      audience,
      segmentIndex: segmentIndexer(audience.segments.map((s) => s.id)),
    });
    expect(profiles).toHaveLength(audience.agents.length);
    // Every agent acts, even if the action is to ignore the content. An agent
    // that simply vanishes from the results is not inspectable.
    expect(profiles.every((p) => p.action !== null)).toBe(true);
  });

  it('is deterministic: the same run yields identical profiles', async () => {
    const a = await run();
    const b = await run();
    const index = segmentIndexer(a.audience.segments.map((s) => s.id));
    const pa = deriveAgentProfiles({ events: a.events, audience: a.audience, segmentIndex: index });
    const pb = deriveAgentProfiles({ events: b.events, audience: b.audience, segmentIndex: index });
    expect(JSON.stringify(pb)).toBe(JSON.stringify(pa));
  });

  it('gives every agent an inspectable reason, not just a label', async () => {
    const { audience, events } = await run();
    const profiles = deriveAgentProfiles({
      events,
      audience,
      segmentIndex: segmentIndexer(audience.segments.map((s) => s.id)),
    });
    for (const p of profiles) {
      expect(p.archetypeLabel.length).toBeGreaterThan(0);
      expect(p.segmentLabel.length).toBeGreaterThan(0);
      expect(p.motivation.length).toBeGreaterThan(0);
      expect(p.disposition.length).toBeGreaterThan(0);
      expect(p.reaction.length).toBeGreaterThan(0);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the reaction phrase consistent with the action', () => {
    expect(reactionPhrase('REJECT', 0.9)).toContain('Unconvinced');
    expect(reactionPhrase('SHARE', 0.9)).toContain('pass it on');
    expect(reactionPhrase('IGNORE', 0.2)).toContain('moved on');
    expect(reactionPhrase(null, 0)).toBe('Deciding');
  });

  it('modulates confidence by intensity rather than reporting a constant', async () => {
    const { audience, events } = await run();
    const profiles = deriveAgentProfiles({
      events,
      audience,
      segmentIndex: segmentIndexer(audience.segments.map((s) => s.id)),
    });
    const distinct = new Set(profiles.map((p) => p.confidence.toFixed(2)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('labels every journey stage in plain language', () => {
    for (const stage of ['exposure', 'attention', 'interpretation', 'response', 'decision', 'action'] as const) {
      expect(stateLabel(stage).length).toBeGreaterThan(0);
    }
  });

  it('summarises the population consistently', async () => {
    const { audience, events } = await run();
    const profiles = deriveAgentProfiles({
      events,
      audience,
      segmentIndex: segmentIndexer(audience.segments.map((s) => s.id)),
    });
    const summary = profileSummary(profiles);
    expect(summary.total).toBe(profiles.length);
    expect(summary.engaged + summary.ignored + summary.rejected).toBe(summary.total);
  });

  it('reflects the audience response in the per-agent outcomes', async () => {
    // Uses the deliberate strong/weak control pair, not the demo fixture: Velloe
    // and the weak control happen to produce an identical "engaged" count, so
    // asserting on that pair would test nothing and fail for the wrong reason.
    // Measured on the control pair: engaged 17 vs 11, moved-on 5 vs 10.
    const strong = await run(weakVariants.strongControl());
    const weak = await run(weakVariants.vagueAnnouncement());

    const summarise = (r: Awaited<ReturnType<typeof run>>) =>
      profileSummary(
        deriveAgentProfiles({
          events: r.events,
          audience: r.audience,
          segmentIndex: segmentIndexer(r.audience.segments.map((s) => s.id)),
        }),
      );

    const strongSummary = summarise(strong);
    const weakSummary = summarise(weak);

    expect(strongSummary.engaged).toBeGreaterThan(weakSummary.engaged);
    expect(strongSummary.ignored).toBeLessThan(weakSummary.ignored);
  });
});

describe('large populations', () => {
  it('handles 100 agents with every one accounted for', async () => {
    // 100 is a supported configuration, not an aspiration. The failure mode this
    // guards is silent: agents dropped from the population, or events lost,
    // would still produce a plausible-looking screen.
    const dna = heuristicDNA(velloeDemoAsset);
    const audience: Audience = buildAudience({
      dna,
      segments: heuristicSegments(velloeDemoAsset, dna, 100),
      size: 100,
      audienceSeed: 'hundred',
      producedBy: 'test',
    });
    expect(audience.agents).toHaveLength(100);

    const events: AgentEvent[] = [];
    for await (const e of deterministicEngine.run({
      runId: 'run_100',
      asset: velloeDemoAsset,
      dna,
      audience,
      rounds: 3,
      seed: 3,
    })) {
      events.push(e);
    }

    const profiles = deriveAgentProfiles({
      events,
      audience,
      segmentIndex: segmentIndexer(audience.segments.map((s) => s.id)),
    });

    expect(profiles).toHaveLength(100);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(100);
    // Every agent reaches a terminal action, including the ones that leave early.
    expect(profiles.every((p) => p.action !== null)).toBe(true);

    const summary = profileSummary(profiles);
    expect(summary.engaged + summary.ignored + summary.rejected).toBe(100);
  });
});

describe('segment palette', () => {
  it('gives distinct hues to the first six segments', () => {
    const colors = Array.from({ length: 6 }, (_, i) => segmentColor(i));
    expect(new Set(colors).size).toBe(6);
  });

  it('is stable for the same index and wraps beyond the palette', () => {
    expect(segmentColor(2)).toBe(segmentColor(2));
    expect(segmentColor(6)).toBe(segmentColor(0));
  });

  it('maps segment ids to indices', () => {
    const index = segmentIndexer(['a', 'b', 'c']);
    expect(index('b')).toBe(1);
    // An unknown segment must not crash the renderer.
    expect(index('zzz')).toBe(0);
  });
});
