import '@testing-library/jest-dom';
import { configure } from '@testing-library/dom';

// The web10-social suite runs 72 files in parallel on a 2-vCPU CI runner. Under
// that load, the default 1s waitFor/findBy timeout is too tight for multi-step
// effect chains (render → effect → state → re-render → effect), so a long tail
// of otherwise-correct tests flake (a different one each run, all green in
// isolation). Raise the global async timeout so the tests wait for the real
// condition instead of racing the clock — the systemic fix for the
// load-dependent flake class. Individual tests can still override it.
configure({ asyncUtilTimeout: 5000 });

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

// jsdom has no ResizeObserver (the face-crop frame tracks its rendered width
// with one). A no-op mock: observe/disconnect do nothing, the callback is
// captured so a test can fire it. By default it never fires — the component's
// initial getBoundingClientRect read is enough for the tests (jsdom reports
// 0, and the component falls back to the frame's max width).
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  fire(entries: ResizeObserverEntry[] = []) {
    this.callback(entries, this);
  }
}

(globalThis as Record<string, unknown>).ResizeObserver = MockResizeObserver;
