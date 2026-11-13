import { useId } from 'react';
import type { DirectoryKind, DirectorySort } from './directoryMixer';

// Match the other boards' compact preset chips, without a separate panel.
export function DirectorySortSelector({ kind, value, onChange }: {
  kind: DirectoryKind; value: DirectorySort; onChange: (value: DirectorySort) => void;
}) {
  const id = useId();
  const choices = [
    { value: 'popular' as const, label: kind === 'profiles' ? 'Most followers' : 'Most members' },
    { value: 'newest' as const, label: 'Newest' },
  ];
  const stop = (choice: typeof choices[number]) => <label key={choice.value} className="cursor-pointer">
    <input type="radio" name={id} value={choice.value} checked={value === choice.value}
      onChange={() => onChange(choice.value)} className="peer sr-only" />
    <span className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors duration-150 motion-reduce:transition-none peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${value === choice.value
      ? 'border-brand bg-brand-muted text-brand-300'
      : 'border-border bg-elevated text-muted-foreground hover:text-foreground'}`}>
      {choice.label}
    </span>
  </label>;

  return <fieldset aria-label={kind === 'profiles' ? 'Sort profiles' : 'Sort groups'}
    data-testid="directory-sort-selector" className="min-w-0">
    <legend className="sr-only">Sort by</legend>
    <div className="flex flex-wrap items-center gap-2">
      {choices.map(stop)}
    </div>
  </fieldset>;
}
