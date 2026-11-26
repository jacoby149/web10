import { useId, useLayoutEffect, useRef, useState } from 'react';
import { PostBody } from './PostBody';
import { cn } from '@/lib/utils';

/**
 * The expandable post body (post-render.md "The truncation rules", D125): a
 * post's `text` rendered through the ONE `<PostBody>` (the D85 read side),
 * clamped to the surface's line budget when the body is ESSAY-length, with a
 * "See more" / "See less" toggle.
 *
 * An essay-length body (20+ lines of text) must not dominate a card or a
 * description column (the operator's rule, 25.11.2026 — the wall-of-text post
 * that took over the whole feed). The clamp is the height budget; the toggle
 * is the escape hatch. A body that is NOT essay-length renders exactly as
 * before — no clamp style, no button, zero layout drift (design.md §1:
 * "nothing shifts").
 *
 * **The essay gate is a height, not a character count.** Characters wrap
 * differently at every width; the height is what dominates a feed. The
 * natural (unclamped) content height is measured against the trigger budget
 * (20 body lines ≈ 455px at `text-sm leading-relaxed` — the operator's
 * "over 20 lines" line). An embed-heavy post (a link + a provider player
 * card, a handful of lines) stays under the trigger and renders unclamped —
 * the D99 unfurl cards are never cut by the clamp.
 *
 * **The measurement is real layout, before paint.** A `useLayoutEffect`
 * (synchronous, before the browser's first paint) compares the unclamped
 * `scrollHeight` against the collapsed `clientHeight`; the toggle appears in the first
 * frame — no flash, no layout jump. It re-measures on window resize
 * (debounced) and when the text or the budget changes, so a body that
 * overflows at 375px but fits at 1440px shows the toggle only where it
 * actually clamps (and exits the clamp entirely when a width change makes
 * the content fit the trigger again).
 *
 * **The toggle state is per-post interaction state, not screen state.** The
 * feed holds a dozen posts, each with its own expanded/collapsed state — that
 * is the comment-thread open/close precedent (a local `useState` on the
 * surface, not a URL param). The deep-link rule governs SCREENS; a transient
 * clamp on the Nth post in a scroll is not a screen the user links to. The
 * shorts lens is the exception that proves the rule: its description is a
 * SHEET (a distinct surface with its own route param, `?description=1`), not
 * an inline clamp.
 *
 * **The cut is honest (post-render.md rule 3).** The clamp cuts at a line
 * boundary (never mid-word), and a fading scrim at the clamp's foot makes the
 * cut read as a designed taper into the surface's background, not a hard
 * edge above the "See more" affordance.
 */

type Density = 'light' | 'full';

export interface ExpandablePostBodyProps {
  /** The post's markdown `text`. */
  text: string;
  /** `light` (summary surfaces — inline markdown only) or `full` (the detail
    *  surfaces — the whole type scale). Passed through to `<PostBody>`. */
  density?: Density;
  /** The line budget the collapsed state shows: 6 on the card (the teaser's
    *  height budget, the `line-clamp-6` idiom), 12 on the detail surfaces
    *  (a reading column earns the bigger budget). */
  collapsedLines?: number;
  /** The fade scrim's end color — the surface's BACKGROUND token ('card' for
    *  the feed card / the lightbox panel, 'background' for the watch page's
    *  content column). The scrim blends the clamp's foot into that surface. */
  fadeColor?: 'card' | 'background';
  /** The toggle's `data-testid` (the surface's prefix). */
  testId?: string;
  className?: string;
}

/** One body line at `text-sm leading-relaxed` (14px × 1.625). */
const LINE_PX = 22.75;
/** The essay trigger: 20 body lines — the operator's "over 20 lines" line. */
const TRIGGER_LINES = 20;
/** The trigger budget, in px (width-independent: the height is what
 *  dominates the feed, and the height of N lines is N × the line box). */
const TRIGGER_PX = TRIGGER_LINES * LINE_PX;
/** The overflow tolerance (px) between the clamped height and the full
 *  height before we call it a clamp — sub-pixel / margin rounding is not an
 *  overflow; a real extra line (~22.75px) is. */
const OVERFLOW_TOLERANCE_PX = 8;
/** The resize debounce (ms) — wrapping changes with the viewport width, so
 *  the overflow re-measure follows the resize; the debounce keeps a drag
 *  resize from re-measuring on every pixel. */
const RESIZE_DEBOUNCE_MS = 150;

export function ExpandablePostBody({
  text,
  density = 'full',
  collapsedLines = 6,
  fadeColor = 'card',
  testId = 'post-body-toggle',
  className,
}: ExpandablePostBodyProps) {
  const [expanded, setExpanded] = useState(false);
  // The essay regime: the content's natural height exceeded the trigger
  // budget at the current width (the clamp engages). A false initial value
  // means the first paint is the UNCLAMPED render — exactly today's
  // layout — so a fitting post pays nothing (no -webkit-box, no re-measure).
  const [essay, setEssay] = useState(false);
  // The resting clamp's overflow (the "See more" button's presence): the
  // clamped content still exceeds the collapsed budget at the current width.
  const [restingOverflows, setRestingOverflows] = useState(false);
  const clampRef = useRef<HTMLDivElement | null>(null);
  // A stable id per instance (a feed page holds a dozen of these) — the
  // toggle's aria-controls target.
  const bodyId = useId();

  const clamped = essay && !expanded;

  useLayoutEffect(() => {
    const el = clampRef.current;
    if (!el || !text) return;
    const measure = () => {
      if (expanded) return;
      const collapsedHeight = clamped ? el.clientHeight : 0;
      // This element's only inline styles are the clamp. Some layouts report
      // a clipped scrollHeight with those styles on; reading it as natural
      // height makes the layout effect switch the clamp on and off forever.
      const clampStyle = clamped ? el.getAttribute('style') : null;
      if (clampStyle !== null) el.removeAttribute('style');
      const full = el.scrollHeight;
      if (clampStyle !== null) el.setAttribute('style', clampStyle);

      const nextEssay = full > TRIGGER_PX + OVERFLOW_TOLERANCE_PX;
      if (nextEssay !== essay) setEssay(nextEssay);
      if (clamped) setRestingOverflows(nextEssay && full > collapsedHeight + OVERFLOW_TOLERANCE_PX);
    };
    measure();
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, [text, expanded, essay, clamped, collapsedLines]);

  if (!text) return null;

  // The clamp (the CSS line-clamp, inline so the budget is dynamic — a
  // Tailwind class can't be generated from a prop). Applied ONLY in the
  // essay regime (the resting state, collapsed) — a fitting post never
  // carries the -webkit-box layout.
  const clampedStyle: React.CSSProperties | undefined = clamped
    ? {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        WebkitLineClamp: collapsedLines,
      }
    : undefined;

  // The toggle's presence: in the essay regime, the button is up when the
  // content exceeds the resting budget (collapsed — "See more") OR is being
  // shown expanded (— "See less"; expanding is only possible from the
  // collapsed button, so restingOverflows was true on the way in).
  const showToggle = essay && (expanded || restingOverflows);

  return (
    <div className={cn(className)} data-testid={`${testId}-wrap`}>
      <div className="relative">
        <div ref={clampRef} id={bodyId} style={clampedStyle} data-testid={`${testId}-body`}>
          <PostBody text={text} density={density} />
        </div>
        {/* The fade scrim — the clamp's foot blends into the surface so the
            cut reads as a designed taper, not a hard edge. Collapsed only. */}
        {showToggle && !expanded && (
          <div
            aria-hidden="true"
            data-testid={`${testId}-fade`}
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-10',
              fadeColor === 'background'
                ? 'bg-gradient-to-t from-background to-transparent'
                : 'bg-gradient-to-t from-card to-transparent',
            )}
          />
        )}
      </div>
      {showToggle && (
        <button
          type="button"
          data-testid={testId}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 rounded-sm text-sm font-medium text-brand-300 transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}
