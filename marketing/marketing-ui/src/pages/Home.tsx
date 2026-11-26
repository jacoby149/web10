import { ReliableImage } from '@web10/discover/image'
import { useEffect, useState, useRef, useCallback } from 'react'
import { KeyRound, Network, Unlock, Users, Layers, HardDrive } from 'lucide-react'
import { Button } from '../components/ui/button'
import { trackFunnel } from '../lib/analytics'
import { SOCIAL_ORIGIN } from '../lib/origins'

// D125: the classic "web10 Revolution" landing is the marketing page.
// Layout and type reference: the 2022 home/ sources at f3d695394.
// Keep the modern stats endpoint and the single social entry CTA.

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

/* --- Live node stats band (users / apps in the store / data liberated) --- */
interface HomeStats {
  users: number
  app_count: number
  storage: number
}

function StatsBand() {
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
          app_count: data.app_count ?? 0,
          storage: data.storage ?? 0,
        })
      })
      .catch(() => {
        if (!alive) return
        setError(true)
      })

    return () => { alive = false }
  }, [])

  // The band is live evidence, not filler: no numbers, no band.
  if (!stats || error) return null

  const storage = formatBytes(stats.storage)
  const items: Array<{ value: number; unit?: string; label: string; icon: typeof Users }> = [
    { value: stats.users, label: 'users', icon: Users },
    { value: stats.app_count, label: 'apps in the store', icon: Layers },
    { value: storage.value, unit: storage.unit, label: 'data liberated', icon: HardDrive },
  ]

  // The archive's second artwork is a full-width backdrop, not a boxed card.
  return (
    <section aria-label="Network statistics" className="classic-stats px-6 py-8 sm:py-12">
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-3 md:gap-8">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="flex min-w-0 flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
              <Icon className="size-5 shrink-0 text-brand-300 sm:size-6" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0 text-center sm:text-left">
                <span className="block font-classic-display text-2xl leading-none text-foreground tabular-nums sm:text-4xl">
                  <CountUp value={item.value} />
                  {item.unit && (
                    <span className="ml-1 text-[0.6em] font-medium text-muted-foreground">
                      {item.unit}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs font-medium text-muted-foreground sm:text-sm">{item.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const FEATURES = [
  {
    icon: Network,
    title: 'Peer to Peer',
    body: 'High speed experiences, connecting device to device via WebRTC datachannel technology.',
  },
  {
    icon: KeyRound,
    title: 'Own Your Data',
    body: "Bring your data with you across all the internet. Your data isn't stuck anymore, it's on your domain on your terms.",
  },
  {
    icon: Unlock,
    title: 'Data Freedom',
    body: 'Leverage web10 data with user consent. No more company gatekeeping to build integrated and relevant apps.',
  },
]

function Hero() {
  return (
    <section className="classic-hero flex min-h-[30rem] items-center bg-background px-6 py-20 sm:min-h-[36rem] sm:py-28 lg:min-h-[min(40rem,76svh)]">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <h1 className="font-classic-display text-[clamp(2.25rem,5.5vw,5rem)] font-normal leading-[1.08] tracking-[-0.025em]">
          The web10 <span className="block text-brand-300 md:inline">Revolution</span>
        </h1>
        <p className="mt-6 max-w-[36rem] text-balance text-lg leading-relaxed text-foreground sm:text-2xl">
          Use a web10 app. Sign up for an account. Get a domain name to
          start owning your photos, music, and data on the internet.
        </p>
        {/* Single entry CTA (operator, 25.11.2026: "should JUST be Enter web10
            social") — into the app; signup happens in the authenticator from
            there, the same way the navbar's "Open web10 social" works. */}
        <div className="mt-8 sm:mt-10">
          <Button asChild size="lg" variant="brand" className="h-12 rounded-sm px-8 tracking-wide active:bg-foreground" data-testid="classic-enter-cta">
            <a href={SOCIAL_ORIGIN} onClick={() => trackFunnel('enter_click')}>
              Enter web10 social
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section aria-label="About web10" className="px-6 py-12 sm:py-16 lg:py-20">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-3 md:gap-8">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex flex-col items-center gap-3 text-center">
            <feature.icon className="size-8 text-brand-300" strokeWidth={1.5} />
            <h2 className="font-classic-display text-xl text-foreground sm:text-2xl">
              {feature.title}
            </h2>
            <p className="max-w-[31ch] text-pretty text-lg leading-relaxed text-muted-foreground">
              {feature.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Pledge() {
  return (
    <section aria-label="The 2022 pledge" className="classic-pledge px-6 py-12 sm:py-20">
      <figure className="mx-auto max-w-6xl">
        <blockquote className="max-w-prose text-base leading-relaxed text-foreground">
          We pledge to make an internet space in which users lead their
          internet destiny.
        </blockquote>
        <figcaption className="mt-4 text-foreground">
          <span className="block font-classic-display text-lg">— web10 Team</span>
          <span className="mt-3 block text-sm italic text-muted-foreground">2022</span>
        </figcaption>
      </figure>
    </section>
  )
}

// The 2022 team grid: square photos in three columns, the first member
// anchored left (NOT centered — operator memory of the original), one card
// per person, built to grow as the team did.
const TEAM = [
  {
    name: 'Jacob Hoffman',
    role: 'Founder, web10',
    img: '/founder-2022.jpg',
    alt: 'Jacob Hoffman, founder of web10',
  },
]

function Team() {
  return (
    <section className="bg-background px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-classic-display text-3xl text-foreground sm:text-4xl">
          Team
        </h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {TEAM.map((member) => (
            <div key={member.name} className="w-full max-w-72">
              <ReliableImage
                src={member.img}
                alt={member.alt}
                width={640}
                height={640}
                loading="lazy"
                className="aspect-square w-full rounded-sm object-cover"
              />
              <div className="mt-4">
                <h3 className="font-classic-display text-xl text-foreground">{member.name}</h3>
                <p className="mt-1 text-base text-muted-foreground">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="classic-footer px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} web10</span>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-4">
          <a href="/docs" className="hover:text-foreground">Docs</a>
          <a href="/docs/terms" className="hover:text-foreground">Terms</a>
          <a href="/docs/privacy" className="hover:text-foreground">Privacy</a>
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
    <div className="classic-surface min-h-screen bg-background">
      <main>
        <Hero />
        <div className="classic-paper">
          <Features />
        </div>
        <StatsBand />
        <div className="classic-paper">
          <Team />
        </div>
        <Pledge />
      </main>
      <Footer />
    </div>
  )
}

export default Home
