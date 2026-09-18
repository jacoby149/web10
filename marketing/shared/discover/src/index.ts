// @web10/discover — the shared discover card + video player (D73).
//
// One source, two apps: web10-social and marketing-ui both compose these, so
// the discover feature is the same on both and can't drift. The data layer is
// injected (readComments / createComment / onToggleReaction) — the package is
// presentational and knows nothing about wapi or the public ledger.

export { DiscoverCard, type DiscoverCardProps } from './DiscoverCard';
export { VideoPlayer, sourceFromMedia, ImmersiveHls, InlineVideo, type VideoSource, type VideoPlayerProps } from './VideoPlayer';
export { HlsVideoPlayer } from './HlsVideoPlayer';
export { MediaCarousel, type MediaCarouselProps } from './MediaCarousel';
export { PostActions, type PostActionsProps, type PostActionMode, type ReactionKind } from './PostActions';
export { CommentThread, type CommentThreadProps } from './CommentThread';
export { RankBadge, heatTier, HEAT_SHADOW } from './RankBadge';
export { Badge, IconBtn, Avatar, AvatarFallback, Skeleton, TextInput, Select } from './ui';
export { cn, formatCount, hashToColor, timeAgo, parseCreatedAt } from './utils';
export type {
  DiscoverPost,
  MediaItem,
  TranscodingSettings,
  TranscodingVariant,
  CommentItem,
  CommentPageResult,
  ReadComments,
  ReadReplies,
  CreateComment,
  UploadCommentMedia,
} from './types';
