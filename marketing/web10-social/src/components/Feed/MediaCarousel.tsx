// D73: the media carousel now lives in the shared @web10/discover package
// (one source, both apps). Thin re-export shim — consumers keep their import
// path.
export { MediaCarousel, type MediaCarouselProps } from '@web10/discover';
