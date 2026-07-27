import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
}

function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = 'Search posts, tags, topics…',
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  return (
    <div
      className={[
        'group relative flex items-center rounded-full border transition-colors duration-150 ease-out',
        focused
          ? 'border-brand bg-surface shadow-[0_0_0_1px_var(--color-brand)]'
          : 'border-border bg-elevated hover:border-border',
      ].join(' ')}
    >
      <Search
        className="ml-3.5 h-4 w-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="h-11 border-0 bg-transparent bg-none px-3 pr-10 text-sm text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        aria-label="Search posts and topics"
        data-testid="trending-search-input"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear search"
          data-testid="trending-search-clear"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      ) : (
        <kbd className="absolute right-3 hidden h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:flex">
          ⌘K
        </kbd>
      )}
    </div>
  );
}

export { SearchBar };
