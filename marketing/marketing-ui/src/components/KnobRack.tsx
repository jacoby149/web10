import { useMemo } from 'react';
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

  return (
    <div
      data-testid="knob-rack"
      className="mx-auto max-w-4xl rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur-sm sm:p-6"
    >
      {/* Preset chips */}
      <div
        className="flex flex-wrap items-center justify-center gap-2"
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

      {/* Knobs */}
      <div className="mt-6 flex items-start justify-center gap-6 sm:gap-10">
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
  );
}

export { KnobRack };
export type { KnobRackProps };