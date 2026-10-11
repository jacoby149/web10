import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, type RefObject } from 'react';

// Mock the data layer so the hook's trackPostViewport call is observable. The
// mock is hoisted (vi.mock runs before the imports below), so the hook's
// `import { trackPostViewport } from '@/data/views'` resolves to this fn.
const { trackPostViewportMock } = vi.hoisted(() => ({
  trackPostViewportMock: vi.fn(),
}));
vi.mock('../../data/views', () => ({
  trackPostViewport: trackPostViewportMock,
}));

import { useDwellTracking } from '../../hooks/useDwellTracking';

// The controllable IntersectionObserver mock (src/__tests__/setup.ts) captures
// each observer's callback + the element observe() was called with. Drive it
// directly to simulate a card entering / leaving the viewport. The hook
// measures dwell with Date.now(), so the tests control the clock to make the
// timing deterministic (a "flash" = under the 500ms floor, a "read" = over it).
type MockIO = {
  instances: { callback: IntersectionObserverCallback; observed: Element | null }[];
};

function liveObservers(): MockIO['instances'] {
  return ((globalThis as unknown as Record<string, MockIO>).IntersectionObserver as unknown as MockIO).instances;
}

function findObserver(el: Element) {
  return liveObservers().find((o) => o.observed === el);
}

// A ref + the hook, rendered together (useRef must live inside a hook).
function renderDwell(postId: string | undefined, surface: string) {
  const el = document.createElement('div');
  const ref: RefObject<HTMLElement | null> = { current: el };
  const result = renderHook(() => {
    const r = useRef<HTMLElement | null>(el);
    useDwellTracking(r, postId, surface);
    return r;
  });
  return { el, result };
}

describe('useDwellTracking (D86 — the client-gated viewport tier)', () => {
  let now: number;

  beforeEach(() => {
    trackPostViewportMock.mockReset();
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the accumulated dwell when the card leaves the viewport', () => {
    const { el } = renderDwell('p1', 'feed');
    const obs = findObserver(el);
    expect(obs).toBeDefined();

    // The card is ≥50% visible…
    act(() => {
      obs!.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver);
    });
    // …and stays visible for a while (over the 500ms floor).
    now += 2000;
    // The card leaves → flush the dwell.
    act(() => {
      obs!.callback([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver);
    });

    expect(trackPostViewportMock).toHaveBeenCalledTimes(1);
    const [docId, surface, dwellMs, peak] = trackPostViewportMock.mock.calls[0];
    expect(docId).toBe('p1');
    expect(surface).toBe('feed');
    expect(dwellMs).toBe(2000);
    expect(peak).toBe(1); // the peak visibility fraction
  });

  it('does not report a sub-500ms flash (a scroll-past)', () => {
    const { el } = renderDwell('p1', 'feed');
    const obs = findObserver(el);

    act(() => {
      obs!.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver);
    });
    now += 100; // a brief blip, well under the floor
    act(() => {
      obs!.callback([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver);
    });
    expect(trackPostViewportMock).not.toHaveBeenCalled();
  });

  it('reports each visible span when the card leaves (the feed scroll pattern)', () => {
    const { el } = renderDwell('p1', 'feed');
    const obs = findObserver(el);

    // Visible 800ms, then leaves → reports that visit's dwell.
    act(() => obs!.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver));
    now += 800;
    act(() => obs!.callback([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver));
    expect(trackPostViewportMock).toHaveBeenCalledTimes(1);
    expect(trackPostViewportMock.mock.calls[0][2]).toBe(800);

    // Visible 800ms again, then leaves → a fresh event (the server dedupes
    // within the window; the test asserts the client reports each visit).
    now += 50;
    act(() => obs!.callback([{ isIntersecting: true, intersectionRatio: 0.6 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver));
    now += 800;
    act(() => obs!.callback([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver));
    expect(trackPostViewportMock).toHaveBeenCalledTimes(2);
    expect(trackPostViewportMock.mock.calls[1][2]).toBe(800);
    expect(trackPostViewportMock.mock.calls[1][3]).toBe(0.6);
  });

  it('is inert without a post id (no observer registered)', () => {
    const { el } = renderDwell(undefined, 'feed');
    expect(findObserver(el)).toBeUndefined();
  });

  it('is inert without a surface label', () => {
    const { el } = renderDwell('p1', '');
    expect(findObserver(el)).toBeUndefined();
  });

  it('reports the dwell on unmount (the card leaves with the screen)', () => {
    const { el, result } = renderDwell('p1', 'discover');
    const obs = findObserver(el);

    act(() => obs!.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], obs as unknown as IntersectionObserver));
    now += 1000;
    result.unmount();
    expect(trackPostViewportMock).toHaveBeenCalledTimes(1);
    expect(trackPostViewportMock.mock.calls[0][2]).toBe(1000);
  });
});
