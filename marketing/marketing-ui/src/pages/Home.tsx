import { useEffect, useState, useRef, useCallback } from 'react'
import { Send, Inbox, ShieldCheck, Users, Layers, HardDrive } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import {
  REACH_GAP_EXAMPLE,
  WEB10_DELIVERY_PERCENT,
  deliveryPercent,
  formatFollowerCount,
} from '../lib/reachGap'
import { trackFunnel } from '../lib/analytics'
import { SOCIAL_ORIGIN } from '../lib/origins'

function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

function formatBytes(bytes: number): { value: number; unit: string } {
  if (!bytes || bytes < 1) return { value: 0, unit: 'B' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return { value: Math.round(bytes / Math.pow(1024, i)), unit: units[i] }
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

/* --- Count-up numeral (respects prefers-reduced-motion) --- */
function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current

  const animate = useCallback((ts: number) => {
    if (!startRef.current) startRef.current = ts
    const progress = Math.min((ts - startRef.current) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
    setDisplay(Math.round(eased * value))
    if (progress < 1) rafRef.current = requestAnimationFrame(animate)
  }, [value, duration])

  useEffect(() => {
    if (reduced) {
      setDisplay(value)
      return
    }
    startRef.current = 0
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, animate, reduced])

  return <>{formatNumber(display)}</>
}

/* --- HomeStatsBar --- */
interface HomeStats {
  users: number
  apps: number
  storage: number
}

function HomeStatsBar() {
  const [stats, setStats] = useState<HomeStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`${nodeApi()}/v3/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: any) => {
        if (!alive) return
        setStats({
          users: data.users ?? 0,
          apps: Array.isArray(data.apps) ? data.apps.length : 0,
          storage: data.storage ?? 0,
        })
      })
      .catch(() => {
        if (!alive) return
        setError(true)
      })

    return () => { alive = false }
  }, [])

  if (!stats || error) return null

  const storage = formatBytes(stats.storage)
  const items: Array<{ value: number; unit?: string; label: string; icon: typeof Users }> = [
    { value: stats.users, label: 'platform users', icon: Users },
    { value: stats.apps, label: 'appstore apps', icon: Layers },
    { value: storage.value, unit: storage.unit, label: 'data liberated', icon: HardDrive },
  ]

  return (
    <div className="reveal mx-auto mt-14 max-w-3xl [animation-delay:400ms]">
      <div className="grid grid-cols-3 gap-4">
        {items.map((item, i) => {
          const Icon = item.icon
          return (
            <div
              key={item.label || i}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-6 sm:px-6 sm:py-8"
            >
              <Icon className="h-4 w-4 text-brand-400 opacity-60" strokeWidth={1.5} />
              <span className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground tabular-nums sm:text-3xl">
                <CountUp value={item.value} />
                {item.unit && (
                  <span className="ml-1 text-[0.6em] font-medium text-muted-foreground">
                    {item.unit}
                  </span>
                )}
              </span>
              <span className="text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-background px-4 pt-24 pb-20 sm:px-6 sm:pt-32 sm:pb-28">
      {/* the one permitted decorative flourish (design.md §4) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-16 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-brand opacity-20 blur-[120px]"
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="reveal mb-6 text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          The web10 node
        </p>
        <img
          src="/brand/logo-lockup.png"
          alt="web10"
          className="reveal mb-8 h-10 [animation-delay:80ms] sm:h-12"
        />
        <h1 className="reveal font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em] [animation-delay:160ms] sm:text-5xl lg:text-[3.5rem]">
          Your audience.
        </h1>
        <p className="reveal mt-6 max-w-xl text-lg leading-[1.6] text-muted-foreground [animation-delay:240ms]">
          Every post reaches every follower. Not a promise the algorithm can
          revoke — an architecture that can't.
        </p>
        <div className="reveal mt-10 [animation-delay:320ms]">
          <Button asChild size="lg" variant="brand">
            <a href={SOCIAL_ORIGIN}>Enter web10!</a>
          </Button>
        </div>
        <HomeStatsBar />
      </div>
    </section>
  )
}

function ReachGapBar({
  label,
  shown,
  followers,
  tone,
}: {
  label: string
  shown: number
  followers: number
  tone: 'muted' | 'brand'
}) {
  const pct = deliveryPercent(shown, followers)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatFollowerCount(shown)} / {formatFollowerCount(followers)} shown ({pct}%)
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-elevated">
        <div
          className={`h-full rounded-full ${tone === 'brand' ? 'bg-brand' : 'bg-muted-foreground/60'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ReachGap() {
  return (
    <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
          The reach gap is real.
        </h2>
        <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
          A million followers, and the platform decides which 300,000 see the
          next post. Subscribing was never delivery — it was permission for
          the algorithm to maybe show you. That gap is visible in your own
          analytics right now.
        </p>

        <div className="reveal mt-10 flex flex-col gap-6 [animation-delay:160ms]">
          <ReachGapBar
            label="Elsewhere"
            shown={REACH_GAP_EXAMPLE.shownElsewhere}
            followers={REACH_GAP_EXAMPLE.followers}
            tone="muted"
          />
          <ReachGapBar
            label="On your web10 node"
            shown={REACH_GAP_EXAMPLE.followers}
            followers={REACH_GAP_EXAMPLE.followers}
            tone="brand"
          />
        </div>

        <p className="reveal mt-8 text-sm text-muted-foreground [animation-delay:240ms]">
          Same following. Same post. {WEB10_DELIVERY_PERCENT}% delivery on
          your node is architecture, not a setting someone can change.
        </p>
      </div>
    </section>
  )
}

const HOW_IT_WORKS = [
  {
    icon: Send,
    title: 'You post once',
    description: 'Text, photos, video — published from your node, on your domain.',
  },
  {
    icon: Inbox,
    title: 'It lands in every inbox',
    description:
      "Every follower's inbox gets the post the instant you publish. No feed algorithm decides who's shown.",
  },
  {
    icon: ShieldCheck,
    title: '100% delivery, by architecture',
    description:
      "It can't be quietly revoked, because it isn't a policy — it's how the inbox pattern works.",
  },
]

// staggered ≤80ms apart (design.md §7) — literal classes, not a template
// literal, so Tailwind's static scanner can find them at build time.
const STAGGER_DELAY = ['[animation-delay:0ms]', '[animation-delay:80ms]', '[animation-delay:160ms]']

function HowItWorks() {
  return (
    <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <h2 className="reveal text-center font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
          How it works
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <Card key={step.title} className={`reveal bg-surface ${STAGGER_DELAY[i]}`}>
              <CardHeader>
                <step.icon className="mb-2 h-6 w-6 text-brand-400" strokeWidth={1.5} />
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} web10</span>
        <div className="flex gap-6">
          <a href="/docs" className="hover:text-foreground">Docs</a>
          <a href="/docs/sdk" className="hover:text-foreground">SDK</a>
          <a href="/app-store" className="hover:text-foreground">App Store</a>
          <a href={SOCIAL_ORIGIN} className="hover:text-foreground">Sign In</a>
          <a href="https://github.com/jacoby149/web10" className="hover:text-foreground">GitHub</a>
        </div>
      </div>
    </footer>
  )
}

function Home() {
  useEffect(() => {
    trackFunnel('landing')
  }, [])
  return (
    <>
      <Hero />
      <ReachGap />
      <HowItWorks />
      <Footer />
    </>
  )
}

export default Home
