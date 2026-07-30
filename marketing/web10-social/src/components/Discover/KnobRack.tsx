// VERBATIM COPY from marketing/marketing-ui/src/components/KnobRack.tsx
// Keep in sync with marketing-ui; see design.md §D22 (separate package, no premature sharing).

import { useMemo, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { RotaryKnob } from './RotaryKnob';
import {
  PRESETS,
  WEIGHT_DETENTS,
  HALF_LIFE_LABELS,
  CHARACTER_LABELS,
  type KnobState,
  type PresetId,
} from '@/lib/powerMean';

// KnobRack — the synth rack: preset chips + 5 rotary knobs.
//
// The rack is one piece of hardware. Preset chips at top, knobs below.
// "Guitar-center gear you want to touch" — design.md §12.

interface KnobRackProps {
  state: KnobState;
  activePreset: PresetId | null;
  onChange: (key: keyof KnobState, value: number) => void;
  onPreset: (id: PresetId) => void;
}

function KnobRack({ state, activePreset, onChange, onPreset }: KnobRackProps) {
  const weightLabels = useMemo(
    () => WEIGHT_DETENTS.map((_, i) => String(WEIGHT_DETENTS[i])),
    [],
  );
  // Knobs are power-user controls — presets are the default, the synth rack
  // hides behind "Advanced" so the surface reads clean (no heavy bordered
  // card colliding with the page's header/topic bars).
  const [expanded, setExpanded] = useState(false);

  return (
    <div data-testid="knob-rack" className="mx-auto max-w-4xl">
      {/* Preset chips */}
      <div
        className="flex flex-wrap items-center justify-start gap-2"
        role="group"
        aria-label="Presets"
      >
        {PRESETS.map(preset => {
          const active = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-${preset.id}`}
              onClick={() => onPreset(preset.id)}
              className={[
                'rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                active
                  ? 'border-brand bg-brand-muted text-brand-300 shadow-[0_0_16px_-4px_var(--color-glow)]'
                  : 'border-border bg-elevated text-muted-foreground hover:border-border/80 hover:text-foreground',
              ].join(' ')}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Advanced toggle — reveals the synth rack */}
      <div className="mt-3 flex justify-start">
        <button
          type="button"
          data-testid="knobs-advanced-toggle"
          aria-expanded={expanded}
          aria-controls="knob-advanced-panel"
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {expanded ? 'Hide controls' : 'Advanced'}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Collapsible knob panel — knobs stay mounted; grid-rows trick animates
          height without measuring. Presets keep working while collapsed. */}
      <div
        id="knob-advanced-panel"
        className={`grid transition-all duration-300 ease-out ${
          expanded ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="knob-row flex items-start justify-start gap-6 overflow-x-auto rounded-2xl bg-surface/50 px-4 py-6 sm:justify-center sm:gap-10 sm:overflow-visible" aria-hidden={!expanded}>
            <RotaryKnob
              label="Recency"
              value={state.recency}
              maxValue={5}
              labels={weightLabels}
              onChange={v => onChange('recency', v)}
              dataTestId="knob-recency"
            />
            <RotaryKnob
              label="Likes"
              value={state.likes}
              maxValue={5}
              labels={weightLabels}
              onChange={v => onChange('likes', v)}
              dataTestId="knob-likes"
            />
            <RotaryKnob
              label="Comments"
              value={state.comments}
              maxValue={5}
              labels={weightLabels}
              onChange={v => onChange('comments', v)}
              dataTestId="knob-comments"
            />
            <RotaryKnob
              label="Time"
              value={state.halfLife}
              maxValue={5}
              labels={HALF_LIFE_LABELS}
              onChange={v => onChange('halfLife', v)}
              dataTestId="knob-time"
            />
            <RotaryKnob
              label="Character"
              value={state.character}
              maxValue={5}
              labels={CHARACTER_LABELS}
              onChange={v => onChange('character', v)}
              dataTestId="knob-character"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export { KnobRack };
export type { KnobRackProps };