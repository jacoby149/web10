import { useEffect, useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { loadProfileCatalog, suggestEntries, type CatalogEntry, type CatalogKind } from '@/data/profileCatalogs';
import { cn } from '@/lib/utils';

interface CatalogInputProps {
  kind: CatalogKind;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string, entry?: CatalogEntry) => void;
  disabled?: boolean;
}

export function CatalogInput({ kind, label, placeholder, value, onChange, disabled }: CatalogInputProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<CatalogEntry[]>();
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const open = expanded && !disabled && value.trim().length >= 2;

  useEffect(() => {
    if (!open || entries) return;
    let live = true;
    setFailed(false);
    void loadProfileCatalog(kind).then(rows => { if (live) setEntries(rows); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open, entries, kind]);

  const options = useMemo(() => open && entries ? suggestEntries(entries, value) : [], [open, entries, value]);
  const showOptions = options.length > 0;
  const selected = showOptions ? options[active] : undefined;
  const selectedId = selected ? `${id}-${selected.id}` : undefined;

  useEffect(() => {
    if (selectedId) document.getElementById(selectedId)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  function close() { setExpanded(false); setActive(-1); }
  function choose(entry: CatalogEntry) { onChange(entry.label, entry); close(); }

  return (
    <div className="relative space-y-1">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>{label}</label>
      <Input
        id={id}
        data-testid={`${kind}-catalog-input`}
        className="min-h-11"
        type="text"
        autoComplete="off"
        maxLength={160}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={showOptions ? `${id}-options` : undefined}
        aria-activedescendant={selectedId}
        onFocus={() => setExpanded(true)}
        onBlur={close}
        onChange={event => { setExpanded(true); setActive(-1); onChange(event.target.value); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            setExpanded(true);
            if (showOptions) {
              event.preventDefault();
              setActive(event.key === 'ArrowDown' ? (active + 1) % options.length : active < 1 ? options.length - 1 : active - 1);
            }
          } else if (event.key === 'Enter' && open && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            if (selected) choose(selected);
            else close();
          }
        }}
      />
      {open && (
        <div className={cn('absolute inset-x-0 z-30 rounded-md border border-border bg-popover p-1 shadow-lg', kind === 'cities' ? 'bottom-full' : 'top-full')}>
          {showOptions ? (
            <ul id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`} className="max-h-44 overflow-y-auto">
              {options.map((entry, index) => (
                <li key={entry.id} id={`${id}-${entry.id}`} role="option" aria-selected={index === active}
                  onPointerMove={event => { if (event.pointerType === 'mouse') setActive(index); }}
                  onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)}
                  className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-elevated', index === active && 'bg-elevated')}>
                  <span className="min-w-0 flex-1 break-words text-foreground">{entry.name}</span>
                  {entry.detail && <span className="text-right text-xs text-muted-foreground">{entry.detail}</span>}
                </li>
              ))}
            </ul>
          ) : <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{failed ? 'Suggestions unavailable. You can still type your own.' : entries ? 'No matches. You can keep what you typed.' : 'Loading suggestions…'}</p>}
        </div>
      )}
    </div>
  );
}
