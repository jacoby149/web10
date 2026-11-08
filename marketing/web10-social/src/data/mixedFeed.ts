import { createMixedFeedReader as createSharedMixedFeedReader, type MixedFeedOptions } from '@web10/discover/mixed-feed';
import { readFeedPage } from './feed';

export type { MixedFeedPage } from '@web10/discover/mixed-feed';

/** Only the authenticated social app opts into its ambient-client home read.
 * Public mode always uses explicit transport or the caller's public adapter. */
export function createMixedFeedReader(options: MixedFeedOptions) {
  return createSharedMixedFeedReader({
    ...options,
    homeRead: options.homeRead ?? (options.credential !== null ? readFeedPage : undefined),
  });
}
