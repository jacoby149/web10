import { useState, useRef, useCallback, useEffect } from 'react';

// RotaryKnob — a synth-style stepped rotary control.
//
// UI north star: a VST/synth plugin. The guitar-center feeling of
// walking in and being INVITED to touch the gear. Stepped knobs that
// tick into their detents, readouts that respond mid-drag, the rack
// visually one piece of hardware. Never a settings form.
//
// 6 detents (0..5). Drag up/down to rotate. Click scale to jump.
// Snap-to-detent on release with a tick animation.

interface RotaryKnobProps {
  label: string;
  value: number;
  maxValue: number; // always 5
  labels: string[]; // 6 labels, one per detent
  onChange: (v: number) => void;
  dataTestId?: string;
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
  const knobRef = useRef<HTMLDivElement>(null);

  // Map 0..5 to rotation angle: -135° to +135° (270° sweep)
  const anglePerStep = 270 / maxValue;
  const rotation = -135 + value * anglePerStep;

  const snapToDetent = useCallback(
    (raw: number) => {
      const clamped = Math.max(0, Math.min(maxValue, Math.round(raw)));
      if (clamped !== value) {
        onChange(clamped);
        setTick(Date.now());
      }
    },
    [value, maxValue, onChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      startY.current = e.clientY;
      startValue.current = value;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      (e.target as HTMLElement).style.touchAction = 'none';
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

  // Keyboard: up/down arrows
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

  // Click on scale to jump to a detent
  const handleScaleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = 1 - y / rect.height;
      const detent = Math.round(ratio * maxValue);
      snapToDetent(detent);
    },
    [maxValue, snapToDetent],
  );

  // Tick animation timeout
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => setTick(0), 150);
    return () => clearTimeout(t);
  }, [tick]);

  const tickClass = tick ? 'scale-tick' : '';

  return (
    <div
      className={`group/knob flex flex-col items-center gap-1 ${tickClass}`}
      data-testid={dataTestId ?? 'rotary-knob'}
    >
      {/* Readout */}
      <span className="font-mono text-xs font-medium text-foreground tabular-nums transition-colors duration-150 group-hover/knob:text-brand-300">
        {labels[value]}
      </span>

      {/* Knob body */}
      <div className="relative flex items-center justify-center">
        {/* Scale track */}
        <div
          className="absolute z-0 h-24 w-1 rounded-full bg-elevated"
          onClick={handleScaleClick}
          role="presentation"
        >
          {/* Detent marks */}
          {Array.from({ length: maxValue + 1 }).map((_, i) => {
            const pct = (i / maxValue) * 100;
            const active = i === value;
            return (
              <div
                key={i}
                className={`absolute left-1/2 h-px w-3 -translate-x-1/2 transition-all duration-150 ${
                  active ? 'bg-brand' : 'bg-border'
                }`}
                style={{ top: `${pct}%` }}
              />
            );
          })}
        </div>

        {/* Knob cap */}
        <div
          ref={knobRef}
          className="relative z-10 flex h-16 w-16 cursor-grab items-center justify-center rounded-full border border-border bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-shadow duration-150 ease-out active:cursor-grabbing"
          style={{
            transform: `rotate(${rotation}deg)`,
          }}
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
          {/* Indicator line */}
          <div className="absolute left-1/2 top-2 h-3 w-px -translate-x-1/2 bg-foreground" />

          {/* Grip texture */}
          <div className="h-12 w-12 rounded-full border border-border/50" />
        </div>
      </div>

      {/* Label */}
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export { RotaryKnob };
export type { RotaryKnobProps };