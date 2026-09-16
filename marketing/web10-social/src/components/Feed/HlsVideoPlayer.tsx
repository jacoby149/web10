// D73: the HLS player now lives in the shared @web10/discover package (one
// source, both apps). Thin re-export shim — consumers keep their import path.
export { HlsVideoPlayer } from '@web10/discover';
