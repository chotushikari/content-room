/**
 * The segment palette.
 *
 * One hue per segment, so a group of agents is the same colour everywhere it
 * appears — in the room, in the segment list, on the inspector header. Colour
 * that means different things in different panels is worse than no colour.
 *
 * Six hues chosen for legibility on a near-black field and for separation from
 * each other at small sizes. Beyond six segments the palette wraps, which is
 * acceptable because a seventh segment is already a modelling smell: content
 * does not have seven distinct audiences.
 */
const SEGMENT_HUES = [192, 158, 105, 75, 32, 285] as const;

export function segmentColor(index: number, lightness = 0.75): string {
  const hue = SEGMENT_HUES[index % SEGMENT_HUES.length] ?? SEGMENT_HUES[0];
  return `oklch(${lightness} 0.15 ${hue})`;
}

/** A dimmer variant, for fills and guide lines. */
export function segmentColorDim(index: number): string {
  return segmentColor(index, 0.45);
}

/** Segment index by id, so a component can colour by segment without a lookup table. */
export function segmentIndexer(segmentIds: readonly string[]): (id: string) => number {
  const map = new Map(segmentIds.map((id, i) => [id, i]));
  return (id: string) => map.get(id) ?? 0;
}
