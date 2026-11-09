import { Monitor, Sun, Moon } from 'lucide-react'
import { useTheme, type ThemePreference } from '../lib/theme'

const choices = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] satisfies { value: ThemePreference; label: string; icon: typeof Monitor }[]

export default function Appearance() {
  const { preference, resolved, persistent, setPreference } = useTheme()
  return <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-2xl space-y-6 px-4 py-12 sm:px-6" data-testid="appearance-screen">
    <div className="space-y-2">
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Appearance</h1>
      <p id="appearance-description" className="text-sm text-muted-foreground">Follow your device, or choose your own look. This choice stays in this browser.</p>
    </div>
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
      <fieldset aria-describedby="appearance-description" className="grid min-w-0 grid-cols-3 gap-2">
        <legend className="sr-only">Color theme</legend>
        {choices.map(({ value, label, icon: Icon }) => <label key={value} className="relative min-w-0 cursor-pointer">
          <input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => setPreference(value)}
            data-testid={`theme-${value}`} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          <span className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded border px-2 py-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring ${preference === value ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:bg-elevated hover:text-foreground'}`}>
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />{label}
          </span>
        </label>)}
      </fieldset>
      <p className="text-xs text-muted-foreground" role="status">{preference === 'system'
        ? `Following your device · ${resolved === 'dark' ? 'Dark' : 'Light'} mode`
        : `${resolved === 'dark' ? 'Dark' : 'Light'} mode · Device changes won’t override your choice`}</p>
      {!persistent && <p className="text-xs text-warning" role="alert">Browser storage is unavailable. Your choice works now, but may not be remembered after reloading.</p>}
    </div>
  </main>
}
