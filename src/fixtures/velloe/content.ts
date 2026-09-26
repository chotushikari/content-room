import type { ContentAsset } from '../../core/domain';
import { computeContentHash, contentAssetId } from '../../core/ids';

/**
 * The Velloe demo scenario.
 *
 * DEMO FIXTURE — NOT THE DOMAIN MODEL.
 *
 * Velloe appears in exactly three places in this repository: this directory,
 * docs/demo.md, and the pitch script. A case-insensitive grep for `velloe`
 * anywhere else is a bug (AGENTS.md §3.7). The product is generic; the fixture
 * is a fixture.
 *
 * REPLACING THIS WITH THE REAL POST: paste the real Velloe post into the app
 * (or import its URL) and the whole pipeline runs on it unchanged. This fixture
 * exists so the demo is rehearsable offline; it is deliberately written to have
 * the structural weakness the demo story depends on — the value proposition
 * arrives after the opening, and the call to action is implied rather than
 * stated — so the before/after comparison has something real to show.
 */

const VELLOE_DEMO_BODY = `We have been quiet for a while, and there is a reason for that.

For most of this year we have been rebuilding how campaigns get reviewed before they go out. The old process was a shared document, three rounds of comments, and somebody senior making a judgement call on a Thursday afternoon.

That process had a cost nobody was measuring. The delay was not the tooling, and it was not the people.

It was that reviewers never saw the same version of the message at the same time, so every round restarted the conversation from scratch.

Teams using the new flow cut their review cycle from about two weeks to under two days.

What we are launching today adds a step in front of all of that. Before a campaign goes live, it goes in front of a simulated audience built from the campaign itself, and you watch where attention drops, where trust breaks, and which segment disagrees before anyone outside the team has seen it.

Then you change the message, run the same audience against it again, and see whether the room changed.

If that sounds useful, the link in the comments has a walkthrough.`;

const base = {
  kind: 'social_post' as const,
  source: { type: 'fixture' as const, fixtureId: 'velloe' },
  title: 'Velloe — a rehearsal step before you publish',
  body: VELLOE_DEMO_BODY,
  media: [],
  meta: {
    author: 'Velloe',
    platform: 'linkedin',
    note: 'Demo fixture. Paste the real Velloe post to run the pipeline on live content.',
  },
  partial: false,
  importedBy: 'velloe-demo-fixture',
};

const hash = computeContentHash(base);

export const velloeDemoAsset: ContentAsset = {
  ...base,
  id: contentAssetId(hash, base.kind),
  contentHash: hash,
};

/** A deliberately weak variant, used by evals to prove model sensitivity. */
export const weakVariants = {
  vagueAnnouncement: (): ContentAsset => {
    const wb = {
      ...base,
      title: 'Big news coming',
      body:
        'Excited to share that we have been working on something new! More details coming soon.\n\n' +
        'Stay tuned for updates. Follow us to learn more, check out our website, and don\u2019t forget to subscribe to our newsletter for the latest news and announcements about our journey.',
      importedBy: 'weak-variant-fixture',
    };
    const h = computeContentHash(wb);
    return { ...wb, id: contentAssetId(h, wb.kind), contentHash: h };
  },
  strongControl: (): ContentAsset => {
    const sb = {
      ...base,
      title: 'Cut campaign review from two weeks to two days',
      body:
        'Campaign review takes fourteen days and the delay is not the tooling.\n\n' +
        'It is that reviewers never see the same version of the message at the same time.\n\n' +
        'Before a campaign goes live, put it in front of a simulated audience built from the campaign itself. See where attention drops and where trust breaks.\n\n' +
        'Change the message, run the same audience again, and see whether the room changed.\n\n' +
        'Read the walkthrough at the link below.',
      importedBy: 'strong-variant-fixture',
    };
    const h = computeContentHash(sb);
    return { ...sb, id: contentAssetId(h, sb.kind), contentHash: h };
  },
};

export const VELLOE_FIXTURE_ID = 'velloe';
