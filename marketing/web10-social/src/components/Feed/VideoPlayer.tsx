// D73: the video player now lives in the shared @web10/discover package (one
// source, both apps). This file is a thin re-export shim so every existing
// consumer (feed, lightbox, groups, shorts, discover) keeps its import path.
export {
  VideoPlayer,
  sourceFromMedia,
  ImmersiveHls,
  InlineVideo,
  type VideoSource,
  type VideoPlayerProps,
} from '@web10/discover';
