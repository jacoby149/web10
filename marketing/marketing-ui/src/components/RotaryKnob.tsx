import { useState, useRef, useCallback, useEffect, useId } from 'react';

// RotaryKnob — a synth-style stepped rotary control.
//
// UI north star: a VST/synth plugin. The guitar-center feeling of
// walking in and being INVITED to touch the gear. Stepped knobs that
// tick into their detents, readouts that respond mid-drag, the rack
// visually one piece of hardware. Never a settings form.
//
// 6 detents (0..5). Drag up/down to rotate. Snap-to-detent with a tick
// pulse on change. The whole face is one SVG: a 270° gauge arc that
// fills with the value, detent ticks that light as you pass them, a
// beveled cap, and a needle that stays *inside* the ring — so the
// readout above and the label below are never touched.

interface RotaryKnobProps {
  label: string;
  value: number;
  maxValue: number; // always 5
  labels: string[]; // 6 labels, one per detent
  onChange: (v: number) => void;
  dataTestId?: string;
}

// Geometry — a 270° sweep centered on 12 o'clock.
const SWEEP = 270;
const START = -135; // degrees; 0 = top, +clockwise
const CENTER = 36;
const ARC_R = 27; // gauge arc radius
const TICK_INNER = 21;
const TICK_OUTER = 25.5;
const CAP_R = 15.5;

// Polar → cartesian. angle in degrees, 0 = top (12 o'clock), +clockwise.
function polar(r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.sin(a), y: CENTER - r * Math.cos(a) };
}

// SVG arc path between two angles along radius r (clockwise).
function arcPath(r: number, startAngle: number, endAngle: number) {
  const start = polar(r, startAngle);
  const end = polar(r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function RotaryKnob({
  label,
  value,
  maxValue,
  labels,
  onChange,
  dataTestId,
}: RotaryKnobProps) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const [tick, setTick] = useState(0);
  const gid = useId(); // unique gradient id per instance

  const valueAngle = START + (value / maxValue) * SWEEP;

  const snapToDetent = useCallback(
    (raw: number) => {
      const clamped = Math.max(0, Math.min(maxValue, Math.round(raw)));
      if (clamped !== value) {
        onChange(clamped);
        setTick(t => t + 1);
      }
    },
    [value, maxValue, onChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      startY.current = e.clientY;
      startValue.current = value;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dy = startY.current - e.clientY;
      const sensitivity = 1.5;
      const stepSize = 20;
      const raw = startValue.current + (dy / stepSize) * sensitivity;
      snapToDetent(raw);
    },
    [snapToDetent],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Keyboard: arrows step one detent.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        snapToDetent(value + 1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        snapToDetent(value - 1);
      }
    },
    [value, snapToDetent],
  );

  // Tick pulse — clears itself so it can re-fire on the next change.
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => setTick(0), 160);
    return () => clearTimeout(t);
  }, [tick]);

  const needle = { from: polar(4.5, valueAngle), to: polar(CAP_R - 2, valueAngle) };

  return (
    <div
      className="group/knob flex shrink-0 select-none flex-col items-center gap-3"
      data-testid={dataTestId ?? 'rotary-knob'}
    >
      {/* Readout — fixed height + min width so digits never shift the rack */}
      <span className="h-4 min-w-[3ch] text-center font-mono text-xs font-medium tabular-nums leading-none text-foreground transition-colors duration-150 group-hover/knob:text-brand-300">
        {labels[value]}
      </span>

      {/* Knob face — one SVG; the needle stays inside the ring */}
      <div
        className={`relative h-[72px] w-[72px] cursor-grab touch-none rounded-full outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:cursor-grabbing ${
          tick ? 'scale-[1.06]' : ''
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={maxValue}
        aria-valuetext={labels[value]}
      >
        <svg viewBox="0 0 72 72" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id={`cap-${gid}`} cx="50%" cy="34%" r="70%">
              <stop offset="0%" stopColor="#232328" />
              <stop offset="60%" stopColor="#1a1a1e" />
              <stop offset="100%" stopColor="#0c0c0e" />
            </radialGradient>
          </defs>

          {/* Gauge track (full 270° sweep) */}
          <path
            d={arcPath(ARC_R, START, START + SWEEP)}
            className="fill-none stroke-border"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* Value fill arc */}
          {value > 0 && (
            <path
              d={arcPath(ARC_R, START, valueAngle)}
              className="fill-none stroke-brand transition-all duration-150 group-hover/knob:stroke-brand-400"
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 3px var(--color-glow-intense))' }}
            />
          )}

          {/* Detent ticks — light up as the value passes them */}
          {Array.from({ length: maxValue + 1 }).map((_, i) => {
            const a = START + (i / maxValue) * SWEEP;
            const p1 = polar(TICK_INNER, a);
            const p2 = polar(TICK_OUTER, a);
            const lit = i <= value;
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                className={lit ? 'stroke-brand-400' : 'stroke-border'}
                strokeWidth={i === 0 || i === maxValue ? 2 : 1.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Beveled cap */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={CAP_R}
            fill={`url(#cap-${gid})`}
            className="stroke-border"
            strokeWidth={1}
          />
          {/* Grip ring — the "touch me" texture */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={CAP_R - 4}
            className="fill-none stroke-white/5"
            strokeWidth={1}
          />

          {/* Needle — brand pointer, stays inside the cap */}
          <line
            x1={needle.from.x}
            y1={needle.from.y}
            x2={needle.to.x}
            y2={needle.to.y}
            className="stroke-brand-300 transition-all duration-150"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 2px var(--color-glow-intense))' }}
          />
        </svg>
      </div>

      {/* Label */}
      <span className="text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground transition-colors duration-150 group-hover/knob:text-foreground">
        {label}
      </span>
    </div>
  );
}

export { RotaryKnob };
export type { RotaryKnobProps };
