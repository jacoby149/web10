import '@testing-library/jest-dom';

// jsdom has no IntersectionObserver (the feed's infinite-scroll sentinel uses
// it). A controllable mock: observe/unobserve/disconnect are no-ops, and the
// callback is captured so a test can fire it (to drive loadMore). By default
// the callback never fires (tests render the first page without auto-loading
// more); call fireIntersectionObservers() to trigger a pending observation.
type FireFn = () => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  // Fire the callback with a single "intersecting" entry (the sentinel is
  // visible → loadMore).
  fire() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this);
  }
}

(globalThis as Record<string, unknown>).IntersectionObserver = MockIntersectionObserver;

// Test helper: fire every live observer (drives the feed's loadMore).
(globalThis as unknown as Record<string, FireFn>).fireIntersectionObservers = () => {
  MockIntersectionObserver.instances.forEach((o) => o.fire());
};
