/**
 * The segment palette.
 *
 * Hues taken from the simulation-world reference: cyan, teal, amber, pink, then
 * violet and green for a fifth and sixth group. One colour per segment, used
 * identically in the world, the roster, the rail and the bars — colour that
 * means two things in two panels is worse than no colour.
 *
 * The first four are the ones that matter; content rarely has more than four
 * genuinely distinct audiences, and beyond six the palette wraps because a
 * seventh group is a modelling smell rather than a design problem.
 */
const SEGMENT_HUES = [196, 168, 78, 350, 285, 140] as const;

export function segmentColor(index: number, lightness = 0.72): string {
  const hue = SEGMENT_HUES[index % SEGMENT_HUES.length] ?? SEGMENT_HUES[0];
  return `oklch(${lightness} 0.15 ${hue})`;
}

/** A dimmer variant, for halos, fills and guide rings. */
export function segmentColorDim(index: number): string {
  return segmentColor(index, 0.45);
}

/** Apply an alpha to an OKLCH string. Canvas has no `color-mix`. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return color.startsWith('oklch(') ? color.replace(/\)$/, ` / ${a.toFixed(3)})`) : color;
}

/** Segment index by id, so a component can colour by segment without a lookup. */
export function segmentIndexer(segmentIds: readonly string[]): (id: string) => number {
  const map = new Map(segmentIds.map((id, i) => [id, i]));
  return (id: string) => map.get(id) ?? 0;
}

/**
 * The five reaction states, matching the token names in globals.css.
 * Same meaning everywhere: ignored recedes, only rejection is alarming.
 */
export const REACTION_COLORS = {
  ignored: 'var(--color-cold)',
  rejected: 'var(--color-negative)',
  weighing: 'var(--color-caution)',
  liked: 'var(--color-positive)',
  shared: 'var(--color-amplify)',
} as const;

export function reactionColorFor(action: string | null): string {
  switch (action) {
    case 'REJECT':
      return REACTION_COLORS.rejected;
    case 'IGNORE':
    case 'STOP':
      return REACTION_COLORS.ignored;
    case 'SHARE':
      return REACTION_COLORS.shared;
    case 'LIKE':
    case 'SAVE':
    case 'FOLLOW':
    case 'COMMENT':
      return REACTION_COLORS.liked;
    default:
      return REACTION_COLORS.weighing;
  }
}
