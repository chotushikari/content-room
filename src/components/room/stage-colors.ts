/**
 * Agent stage colours — the room's grammar.
 *
 * Single source of truth: the canvas renderer, the legend and the feed badges
 * all read from here, so a stage can never be two different colours in two
 * places. Values are OKLCH to match the design tokens.
 */
import type { JourneyStage } from '../../core/domain';

export const STAGE_COLORS: Record<JourneyStage, string> = {
  exposure: 'oklch(0.58 0.008 260)', // dim — asleep
  attention: 'oklch(0.62 0.11 250)', // waking
  interpretation: 'oklch(0.72 0.15 250)', // reading
  response: 'oklch(0.81 0.14 85)', // feeling
  decision: 'oklch(0.78 0.16 250)', // deciding
  action: 'oklch(0.72 0.15 250)', // overridden by valence at action time
};

export const ACTION_COLORS: Record<string, string> = {
  STOP: 'oklch(0.62 0.02 260)',
  IGNORE: 'oklch(0.58 0.008 260)',
  REJECT: 'oklch(0.68 0.17 25)',
  LIKE: 'oklch(0.76 0.14 160)',
  COMMENT: 'oklch(0.76 0.14 160)',
  SHARE: 'oklch(0.79 0.15 160)',
  SAVE: 'oklch(0.79 0.15 160)',
  FOLLOW: 'oklch(0.76 0.14 160)',
  CLICK: 'oklch(0.80 0.13 195)',
  BUY: 'oklch(0.82 0.15 145)',
};

export function colorForAgent(stage: JourneyStage, action: string | null): string {
  if (stage === 'action' && action) {
    return ACTION_COLORS[action] ?? STAGE_COLORS.action;
  }
  return STAGE_COLORS[stage];
}

export const STAGE_ORDER: JourneyStage[] = [
  'exposure',
  'attention',
  'interpretation',
  'response',
  'decision',
  'action',
];

export const STAGE_LEGEND: Array<{ stage: JourneyStage; label: string }> = [
  { stage: 'exposure', label: 'Exposed' },
  { stage: 'attention', label: 'Watching' },
  { stage: 'interpretation', label: 'Interpreting' },
  { stage: 'response', label: 'Reacting' },
  { stage: 'decision', label: 'Deciding' },
  { stage: 'action', label: 'Acted' },
];
