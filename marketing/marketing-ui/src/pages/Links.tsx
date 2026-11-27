import { ReliableImage } from '@web10/discover/image'
import { ArrowRight, ArrowUpRight, BookOpen, Code2, Compass, Shield, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import { SOCIAL_CATALOG_ICON } from '../lib/catalogBrand'
import { API_ORIGIN, AUTH_ORIGIN, SOCIAL_ORIGIN } from '../lib/origins'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

type QuickLink = {
  name: string
  description: string
  icon: typeof ArrowRight
} & ({ path: string; href?: never } | { href: string; path?: never })

const appLinks: QuickLink[] = [
  { path: '/app-store', name: 'App Store', description: 'Find apps that work with your web10 account.', icon: Store },
  { href: AUTH_ORIGIN, name: 'web10 Hub', description: 'Manage your account and app permissions.', icon: Shield },
  { path: '/', name: 'What is web10?', description: 'See how web10 lets you own your data.', icon: Compass },
]

const developerLinks: QuickLink[] = [
  { path: '/docs', name: 'Developer docs', description: 'Build an app with the web10 SDK.', icon: BookOpen },
  { href: `${API_ORIGIN.replace(/\/$/, '')}/docs`, name: 'API reference', description: 'Explore the web10 API endpoints.', icon: Code2 },
]

function QuickLinkList({ links }: { links: QuickLink[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface [&>li:first-child>a]:rounded-t-xl [&>li:last-child>a]:rounded-b-xl">
      {links.map(({ name, description, path, href, icon: Icon }) => {
        const Arrow = href ? ArrowUpRight : ArrowRight
        const row = `flex min-h-14 items-center gap-3 px-3 py-3 transition-colors hover:bg-elevated ${focus}`
        const contents = <>
          <Icon aria-hidden="true" className="size-5 shrink-0 text-brand-300" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-foreground">{name}</span>
            <span className="block text-sm text-muted-foreground">{description}</span>
          </span>
          <Arrow aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </>
        return <li key={name}>{path !== undefined ? <Link to={path} className={row}>{contents}</Link> : <a href={href} className={row}>{contents}</a>}</li>
      })}
    </ul>
  )
}

export default function LinksPage() {
  return (
    <main className="interior-theme min-h-dvh bg-background px-5 py-10 text-foreground sm:px-6 sm:py-14" data-testid="quick-links">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 border-b border-border pb-6">
          <Link to="/" aria-label="web10 home" className={`inline-flex min-h-11 items-center rounded-sm ${focus}`}>
            <BrandLogo className="h-8" />
          </Link>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">Explore web10</h1>
        </header>

        <section aria-label="Apps and information" className="space-y-3">
          <a href={SOCIAL_ORIGIN} className={`flex min-h-20 items-center gap-4 rounded-xl border border-brand/40 bg-brand-muted p-4 transition-colors hover:border-brand ${focus}`}>
            <ReliableImage src={SOCIAL_CATALOG_ICON} alt="" width={48} height={48} className="size-12 shrink-0 rounded-md" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold text-foreground">Open web10 social</span>
              <span className="block text-sm text-muted-foreground">Discover posts, watch videos, and share your own.</span>
            </span>
            <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-brand-300" strokeWidth={1.75} />
          </a>
          <QuickLinkList links={appLinks} />
        </section>

        <section aria-labelledby="quick-links-developers" className="mt-7">
          <h2 id="quick-links-developers" className="mb-2 text-sm font-semibold text-foreground">For developers</h2>
          <QuickLinkList links={developerLinks} />
        </section>
      </div>
    </main>
  )
}
