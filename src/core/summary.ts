import type {
  Audience,
  ContentDNA,
  CreativeBrief,
  Metric,
  MetricsBundle,
  WhyReport,
} from './domain';

/**
 * The verdict: one score, one band, one paragraph, one list of changes.
 *
 * This is the whole point of the product for a user. Everything else the system
 * computes — events, segments, disagreement, evidence references — exists to
 * make this summary defensible, not to be shown.
 *
 * PURE and deterministic, like the rest of the core: no IO, no model, no clock.
 * The same run always produces the same verdict.
 *
 * HONESTY: this is a *simulated* score. It is the simulation's own estimate of
 * how a synthetic audience responded. It is not a forecast of real-world
 * performance, and no claim of measured accuracy is made anywhere. The label is
 * carried in `method` and rendered with the number.
 */

export type VerdictBand = 'Weak' | 'Mixed' | 'Solid' | 'Strong';
export type ViralBand = 'Low' | 'Moderate' | 'High';

export type SegmentReaction = {
  segmentId: string;
  label: string;
  size: number;
  score: number;
  band: VerdictBand;
  /** Plain-language one-liner for this segment. */
  note: string;
};

export type Improvement = {
  /** Imperative, specific, under eight words. */
  title: string;
  /** Why it matters, in one sentence. */
  why: string;
  /** Which metric it should move. */
  moves: string;
  /** The rewrite for this part, if the rewriter produced one. */
  example?: string;
};

export type ContentVerdict = {
  /** 0-100. Simulated. */
  score: number;
  band: VerdictBand;
  /** One sentence a busy person can read in two seconds. */
  headline: string;
  /** Two or three sentences: the actual opinion. */
  read: string;
  /** What is working. */
  likes: string[];
  /** What is not. */
  concerns: string[];
  /** 0-100 simulated amplification estimate. */
  viralScore: number;
  viralBand: ViralBand;
  /** One line explaining the viral band without overclaiming. */
  viralNote: string;
  segments: SegmentReaction[];
  improvements: Improvement[];
  /** Shown with the score, always. */
  method: string;
};

/**
 * Score weights. Documented so the number is auditable and so the stated method
 * cannot drift from the computation.
 *
 * Response quality dominates, because whether people liked it matters more than
 * whether they clicked. Amplification is weighted meaningfully but not
 * dominantly: a share is worth more than a like, and far rarer. Drag subtracts.
 */
const WEIGHTS = {
  positiveResponse: 0.3,
  trust: 0.2,
  clarity: 0.15,
  amplification: 0.15,
  attention: 0.1,
  residual: 0.1,
} as const;

/**
 * Intent metrics are naturally small percentages — a 12% share intent is high for
 * real content. Scaling them keeps them comparable to the 0-100 response metrics
 * instead of silently contributing nothing.
 */
const AMPLIFICATION_SCALE = { share: 3, save: 2, comment: 1.5, follow: 1.5 } as const;
const ACTION_SCALE = 4;

function metricValue(bundle: MetricsBundle, id: Metric['id']): number {
  return bundle.overall.find((m) => m.id === id)?.value ?? 0;
}

export function bandFor(score: number): VerdictBand {
  if (score < 35) return 'Weak';
  if (score < 55) return 'Mixed';
  if (score < 72) return 'Solid';
  return 'Strong';
}

/**
 * The composite score.
 *
 * An earlier version of this product showed twelve separate metrics and left the
 * reader to form their own judgement. Almost nobody does that. Twelve numbers is
 * not more informative than one — it just moves the work onto the user.
 */
export function performanceScore(bundle: MetricsBundle): number {
  const positive = metricValue(bundle, 'positiveResponse');
  const trust = metricValue(bundle, 'trust');
  const clarity = metricValue(bundle, 'clarity');
  const attention = metricValue(bundle, 'attention');
  const ignore = metricValue(bundle, 'ignoreRate');
  const negative = metricValue(bundle, 'negativeResponse');

  const amplification = Math.min(
    100,
    metricValue(bundle, 'shareIntent') * AMPLIFICATION_SCALE.share +
      metricValue(bundle, 'saveIntent') * AMPLIFICATION_SCALE.save +
      metricValue(bundle, 'commentIntent') * AMPLIFICATION_SCALE.comment +
      metricValue(bundle, 'followIntent') * AMPLIFICATION_SCALE.follow,
  );

  // What is left after people who ignored or actively rejected it.
  const residual = Math.max(0, 100 - ignore - negative);

  const raw =
    WEIGHTS.positiveResponse * positive +
    WEIGHTS.trust * trust +
    WEIGHTS.clarity * clarity +
    WEIGHTS.amplification * amplification +
    WEIGHTS.attention * attention +
    WEIGHTS.residual * residual;

  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}

export const SCORE_METHOD =
  'weighted composite of simulated response (positive 30%, trust 20%, clarity 15%), ' +
  'amplification intent (15%, scaled), attention (10%) and residual audience (10%)';

/**
 * "High" anchors for the intent metrics.
 *
 * Intent percentages are naturally small — a 12% share intent is strong for real
 * content. The first version of this function multiplied raw percentages by a
 * flat factor, which let a 12% share intent alone nearly max the scale. These
 * anchors state what "high" means for each signal, so the composite is
 * interpretable rather than an arbitrary tuned number.
 */
const VIRAL_ANCHORS = { share: 25, save: 25, comment: 25 } as const;

const VIRAL_WEIGHTS = {
  share: 0.42, // forwarding is the only real evidence of spread
  save: 0.24, // keeping it signals durable value
  comment: 0.16, // discussion travels less far than forwarding
  positive: 0.18, // liking is necessary but weak evidence on its own
} as const;

export function viralPotential(bundle: MetricsBundle): {
  score: number;
  band: ViralBand;
  note: string;
} {
  const pct = (value: number, anchor: number) => Math.min(100, (value / anchor) * 100);

  const share = pct(metricValue(bundle, 'shareIntent'), VIRAL_ANCHORS.share);
  const save = pct(metricValue(bundle, 'saveIntent'), VIRAL_ANCHORS.save);
  const comment = pct(metricValue(bundle, 'commentIntent'), VIRAL_ANCHORS.comment);
  // Positive response is already 0-100, and ~80 is excellent.
  const positive = metricValue(bundle, 'positiveResponse');

  const base =
    VIRAL_WEIGHTS.share * share +
    VIRAL_WEIGHTS.save * save +
    VIRAL_WEIGHTS.comment * comment +
    VIRAL_WEIGHTS.positive * positive;

  // Content most people scrolled past does not spread, however good the few who
  // stayed thought it was.
  const ignore = metricValue(bundle, 'ignoreRate');
  const penalty = ignore > 50 ? Math.min(15, (ignore - 50) * 0.4) : 0;

  const score = Math.round(Math.min(100, Math.max(0, base - penalty)) * 10) / 10;
  const band: ViralBand = score < 25 ? 'Low' : score < 55 ? 'Moderate' : 'High';

  const note =
    band === 'High'
      ? 'This audience would pass it on without being asked. Sharing is the strongest signal here.'
      : band === 'Moderate'
        ? 'It earns attention but not much forwarding. People would read it and move on.'
        : 'Little reason for anyone to pass this on. Attention alone does not travel.';

  return { score, band, note };
}

/**
 * A segment note that says something specific about THAT segment.
 *
 * The first version varied only by band, so four segments in the same band all
 * read "split on it. Some of this works, some does not." — which is exactly what
 * makes a summary feel machine-generated. This names the metric where the
 * segment diverges most from the audience as a whole.
 *
 * The label is followed by a colon rather than used as a sentence subject,
 * because segment labels are noun phrases of unknown number ("Core audience",
 * "Amplifiers") and verb agreement would read wrong for one or the other.
 */
const GAP_LABELS: Record<string, string> = {
  attention: 'attention',
  clarity: 'clarity',
  trust: 'trust',
  positiveResponse: 'overall response',
  shareIntent: 'willingness to share',
  saveIntent: 'willingness to save it',
  commentIntent: 'willingness to comment',
  followIntent: 'interest in following',
  clickIntent: 'click intent',
  purchaseIntent: 'purchase intent',
  ignoreRate: 'being ignored',
  negativeResponse: 'outright rejection',
};

function segmentNote(
  band: VerdictBand,
  label: string,
  segmentMetrics: Metric[],
  overall: Metric[],
): string {
  // Where does this segment fall furthest behind the audience as a whole?
  const gap = segmentMetrics
    .filter((m) => m.id !== 'ignoreRate' && m.id !== 'negativeResponse')
    .map((m) => {
      const all = overall.find((o) => o.id === m.id)?.value ?? 0;
      return { id: m.id, delta: all - m.value };
    })
    .sort((a, b) => b.delta - a.delta)[0];

  const gapName = gap ? (GAP_LABELS[gap.id] ?? gap.id) : 'the response';
  const meaningful = gap && gap.delta > 3;

  switch (band) {
    case 'Strong':
      return `${label}: convinced. Nothing here needs defending.`;
    case 'Solid':
      return meaningful
        ? `${label}: accept it, though ${gapName} lags more than for the rest.`
        : `${label}: accept it, with little to argue about.`;
    case 'Mixed':
      return meaningful
        ? `${label}: split, and ${gapName} is where they lose it.`
        : `${label}: split on it, without one clear sticking point.`;
    default:
      return meaningful
        ? `${label}: not convinced. ${gapName} is the gap.`
        : `${label}: not convinced by anything here.`;
  }
}

export type VerdictInput = {
  metrics: MetricsBundle;
  dna: ContentDNA;
  why: WhyReport | null;
  brief: CreativeBrief | null;
  audience: Audience;
};

export function deriveVerdict(input: VerdictInput): ContentVerdict {
  const { metrics, dna, why, brief, audience } = input;

  const score = performanceScore(metrics);
  const band = bandFor(score);
  const viral = viralPotential(metrics);

  const ignore = metricValue(metrics, 'ignoreRate');
  const positive = metricValue(metrics, 'positiveResponse');
  const trust = metricValue(metrics, 'trust');
  const weakest = [...metrics.overall]
    .filter((m) => !['ignoreRate', 'negativeResponse'].includes(m.id))
    .sort((a, b) => a.value - b.value)[0];
  const strongest = [...metrics.overall].sort((a, b) => b.value - a.value)[0];

  // -- headline: one line, no hedging, no jargon -----------------------------
  const topFriction = why?.topFrictions[0]?.label ?? dna.potentialFrictions[0]?.label ?? null;
  // The friction label is a noun phrase of unknown grammatical shape, so it is
  // never spliced inline mid-sentence — that produced lines like "but promise
  // arrives late is holding it back". It is always introduced after a colon.
  const headline = (() => {
    if (band === 'Weak') {
      return topFriction
        ? `This will not land. Main reason: ${topFriction}.`
        : 'This will not land. The audience finds no reason to care.';
    }
    if (band === 'Mixed') {
      return topFriction
        ? `Mixed reception. Part of this works; one thing holds it back: ${topFriction}.`
        : 'Mixed reception. There is something here, but it is not coming across.';
    }
    if (band === 'Solid') {
      return topFriction
        ? `This works. One fix would make it clearly better: ${topFriction}.`
        : 'This works. It reads clearly and the audience accepts it.';
    }
    return 'This is strong. The audience understands it, trusts it, and would pass it on.';
  })();

  // -- the read: the actual opinion -----------------------------------------
  const weakestSegment = [...metrics.bySegment]
    .map((s) => ({
      label: s.segmentLabel,
      score: performanceScore({ ...metrics, overall: s.metrics }),
    }))
    .sort((a, b) => a.score - b.score)[0];

  const read = [
    `Of ${audience.size} simulated agents, ${Math.round(positive)}% responded positively and ${Math.round(ignore)}% did not engage at all.`,
    trust >= 60
      ? 'They accept the claim, which is the hard part.'
      : `${Math.round(100 - trust)}% remain unconvinced — this needs more to back it up before it needs more polish.`,
    weakestSegment && weakestSegment.score < score - 8
      ? `${weakestSegment.label} are the least convinced group, so this is written for the wrong reader at the moment.`
      : 'The response is consistent across the audience rather than driven by one group.',
    band === 'Solid' || band === 'Strong'
      ? 'It is publishable as it stands.'
      : 'It is not publishable as it stands.',
  ].join(' ');

  // -- likes / concerns -----------------------------------------------------
  const likes = [
    ...(why?.biggestSignal?.evidence.length ? [why.biggestSignal.headline] : []),
    ...dna.strengths,
  ].slice(0, 3);

  const concerns = [
    ...(topFriction ? [topFriction] : []),
    ...dna.risks,
  ].slice(0, 3);

  // -- improvements: what to actually do -----------------------------------
  // Prefer the rewriter's concrete changes, because they come with the text.
  const improvements: Improvement[] = [];
  if (brief) {
    for (const change of brief.changes.slice(0, 3)) {
      improvements.push({
        title: titleForChange(change.field),
        why: change.reason,
        moves: movesForChange(change.field, weakest?.id, weakest?.label),
        example: change.field.toLowerCase().includes('hook') || change.field.toLowerCase().includes('opening')
          ? brief.recommendedHook
          : change.field.toLowerCase().includes('call to action')
            ? brief.recommendedCTA
            : undefined,
      });
    }
  }
  if (improvements.length === 0 && topFriction) {
    improvements.push({
      title: 'Fix the main friction',
      why: `The audience response is dominated by: ${topFriction.toLowerCase()}.`,
      moves: weakest?.label ?? 'clarity',
    });
  }

  // -- per-segment reaction -------------------------------------------------
  const segments: SegmentReaction[] = metrics.bySegment
    .map((s) => {
      const segScore = performanceScore({ ...metrics, overall: s.metrics });
      const segBand = bandFor(segScore);
      return {
        segmentId: s.segmentId,
        label: s.segmentLabel,
        size: audience.segments.find((x) => x.id === s.segmentId)?.size ?? 0,
        score: segScore,
        band: segBand,
        note: segmentNote(segBand, s.segmentLabel, s.metrics, metrics.overall),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    score,
    band,
    headline,
    read,
    likes,
    concerns,
    viralScore: viral.score,
    viralBand: viral.band,
    viralNote: viral.note,
    segments,
    improvements,
    method: SCORE_METHOD,
  };
}

/** Turn a technical field name into something a person would say. */
function titleForChange(field: string): string {
  const f = field.toLowerCase();
  if (f.includes('hook') || f.includes('opening')) return 'Lead with the point';
  if (f.includes('call to action') || f.includes('cta')) return 'Make the ask single and clear';
  if (f.includes('language')) return 'Cut the jargon';
  if (f.includes('sentence')) return 'Shorten the sentences';
  return field;
}

function movesForChange(field: string, metricId?: string, metricLabel?: string): string {
  const f = field.toLowerCase();
  if (f.includes('hook') || f.includes('opening')) return 'Attention';
  if (f.includes('call to action') || f.includes('cta')) return 'Click intent';
  if (f.includes('language') || f.includes('sentence')) return 'Clarity';
  return metricLabel ?? metricId ?? 'Overall score';
}
