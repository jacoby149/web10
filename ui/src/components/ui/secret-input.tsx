import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';

export function SecretInput({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    const timer = window.setTimeout(hide, 30000);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [visible]);
  return (
    <div className="relative" onBlur={e => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setVisible(false);
    }}>
      <Input {...props} aria-label={label} type={visible ? 'text' : 'password'}
        autoComplete="new-password" spellCheck={false} className={`pr-12 ${props.className || ''}`} />
      <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} aria-pressed={visible}
        onClick={() => setVisible(value => !value)}
        className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
