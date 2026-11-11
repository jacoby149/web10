import { Monitor, Sun, Moon, Palette, ArrowLeft } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';
import Branding from '../shared/Branding';

const choices = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] satisfies { value: ThemePreference; label: string; icon: typeof Monitor }[];

export function Appearance() {
  const { preference, resolved, persistent, setPreference } = useTheme();
  return <section aria-labelledby="appearance-heading" className="space-y-3" data-testid="appearance-settings">
    <h2 id="appearance-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Palette className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      Appearance
    </h2>
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p id="appearance-description" className="text-sm text-muted-foreground">Follow your device, or choose your own. This setting stays in this browser.</p>
      <fieldset aria-describedby="appearance-description" className="grid min-w-0 grid-cols-3 gap-2">
        <legend className="sr-only">Color theme</legend>
        {choices.map(({ value, label, icon: Icon }) => <label key={value} className="relative min-w-0 cursor-pointer">
          <input type="radio" name="appearance" value={value} checked={preference === value}
            onChange={() => setPreference(value)} data-testid={`theme-${value}`}
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          <span className={cn('flex min-h-20 flex-col items-center justify-center gap-2 rounded border px-2 py-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
            preference === value ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:bg-elevated hover:text-foreground')}>
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />{label}
          </span>
        </label>)}
      </fieldset>
      <p className="text-xs text-muted-foreground" role="status">
        {preference === 'system' ? `Following your device · ${resolved === 'dark' ? 'Dark' : 'Light'} mode` : `${resolved === 'dark' ? 'Dark' : 'Light'} mode · Device changes won’t override your choice`}
      </p>
      {!persistent && <p className="text-xs text-warning" role="alert">Browser storage is unavailable. Your choice works now, but may not be remembered after reloading.</p>}
    </div>
  </section>;
}

// Query-owned public screen fits the authenticator's existing URL convention.
// Standalone chrome means it never introduces account reads or consent actions.
export default function AppearancePage({ I }: { I: Record<string, any> }) {
  const back = I.isAuthenticated?.() ? '/?mode=settings' : '/';
  return <main className="min-h-dvh bg-background px-4 py-8 text-foreground" data-testid="appearance-page">
    <div className="mx-auto max-w-md space-y-8">
      <div className="flex justify-center"><Branding I={I} size="sm" tagline={false} /></div>
      <a href={back} className="inline-flex min-h-11 items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{I.isAuthenticated?.() ? 'Back to Settings' : 'Back to sign in'}
      </a>
      <div className="space-y-2"><h1 className="font-display text-2xl font-semibold">Make it yours</h1>
        <p className="text-sm text-muted-foreground">A little brighter. A little darker. Always web10.</p></div>
      <Appearance />
    </div>
  </main>;
}
