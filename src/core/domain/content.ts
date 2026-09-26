import { z } from 'zod';

/** Content kinds. Deliberately broad: Content Room works for any content. */
export const ContentKindSchema = z.enum([
  'social_post',
  'video',
  'reel',
  'short',
  'ad',
  'campaign',
  'product_announcement',
  'landing_page',
  'email',
  'article',
  'script',
  'brand_message',
  'launch_concept',
  'creative_concept',
  'marketing_idea',
]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  social_post: 'Social Post',
  video: 'Video',
  reel: 'Reel',
  short: 'Short',
  ad: 'Ad',
  campaign: 'Campaign',
  product_announcement: 'Product Announcement',
  landing_page: 'Landing Page',
  email: 'Email',
  article: 'Article',
  script: 'Script',
  brand_message: 'Brand Message',
  launch_concept: 'Launch Concept',
  creative_concept: 'Creative Concept',
  marketing_idea: 'Marketing Idea',
};

export const PlatformSchema = z.enum([
  'instagram',
  'linkedin',
  'x',
  'youtube',
  'tiktok',
  'vimeo',
  'spotify',
  'facebook',
  'web',
  'manual',
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const SourceRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), url: z.string().min(1), platform: PlatformSchema }),
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('fixture'), fixtureId: z.string().min(1) }),
]);
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const MediaRefSchema = z.object({
  kind: z.enum(['image', 'video', 'audio']),
  url: z.string().optional(),
  altText: z.string().max(300).optional(),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

/**
 * A normalised piece of content, from any importer.
 *
 * `partial: true` is a NORMAL state, not an error: it means only metadata
 * resolved and the body is missing or incomplete. It drives the manual-paste
 * continuation in the UI, pre-filled with whatever did resolve.
 */
export const ContentAssetSchema = z.object({
  id: z.string().min(1),
  kind: ContentKindSchema,
  source: SourceRefSchema,
  title: z.string().max(300),
  body: z.string().max(20_000),
  media: z.array(MediaRefSchema).max(10),
  meta: z.record(z.string(), z.string()),
  partial: z.boolean(),
  importedBy: z.string().min(1),
  contentHash: z.string().min(1),
});
export type ContentAsset = z.infer<typeof ContentAssetSchema>;

/** The 19-archetype library. A LIBRARY, not mandatory segments. */
export const ARCHETYPE_IDS = [
  'skeptic',
  'power_user',
  'casual_scroller',
  'trend_follower',
  'creator',
  'early_adopter',
  'price_sensitive',
  'practical',
  'community_builder',
  'professional',
  'student',
  'entertainer',
  'researcher',
  'brand_loyalist',
  'curious_explorer',
  'busy_user',
  'value_seeker',
  'social_sharer',
  'silent_consumer',
] as const;
export const ArchetypeIdSchema = z.enum(ARCHETYPE_IDS);
export type ArchetypeId = z.infer<typeof ArchetypeIdSchema>;

export const ARCHETYPE_LABELS: Record<ArchetypeId, string> = {
  skeptic: 'Skeptic',
  power_user: 'Power User',
  casual_scroller: 'Casual Scroller',
  trend_follower: 'Trend Follower',
  creator: 'Creator',
  early_adopter: 'Early Adopter',
  price_sensitive: 'Price Sensitive',
  practical: 'Practical',
  community_builder: 'Community Builder',
  professional: 'Professional',
  student: 'Student',
  entertainer: 'Entertainer',
  researcher: 'Researcher',
  brand_loyalist: 'Brand Loyalist',
  curious_explorer: 'Curious Explorer',
  busy_user: 'Busy User',
  value_seeker: 'Value Seeker',
  social_sharer: 'Social Sharer',
  silent_consumer: 'Silent Consumer',
};

export const FrictionSchema = z.object({
  label: z.string().max(120),
  detail: z.string().max(400),
  span: z.string().max(300).optional(),
});
export type Friction = z.infer<typeof FrictionSchema>;

/** Content DNA — the structured understanding of a piece of content. */
export const ContentDNASchema = z.object({
  hook: z.string().max(300),
  topic: z.string().max(200),
  promise: z.string().max(400),
  valueProposition: z.string().max(400),
  emotion: z.array(z.string().max(60)).min(1).max(6),
  tone: z.array(z.string().max(60)).min(1).max(6),
  cta: z.string().max(300),
  visualStyle: z.string().max(300),
  audienceSignals: z.array(z.string().max(160)).max(10),
  strengths: z.array(z.string().max(200)).min(1).max(8),
  risks: z.array(z.string().max(200)).max(8),
  potentialFrictions: z.array(FrictionSchema).max(8),
  confidence: z.number().min(0).max(1),
});
export type ContentDNA = z.infer<typeof ContentDNASchema>;
