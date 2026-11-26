import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Search, Link as LinkIcon } from 'lucide-react'
import { Button } from './ui/button'
import GitHubStarButton from './GitHubStarButton'
import { trackFunnel } from '../lib/analytics'
import { SOCIAL_ORIGIN } from '../lib/origins'
import BrandLogo from './BrandLogo'
import NavbarGlass from './NavbarGlass'

const navItems = [
  { path: '/', label: 'Home' },
  { path: '/app-store', label: 'App Store' },
  { path: '/freedom', label: 'Freedom' },
  { path: '/docs', label: 'Docs' },
  { path: '/appearance', label: 'Appearance' },
]

function Navbar() {
  const location = useLocation()
  const classic = location.pathname === '/'
  const [mobileOpen, setMobileOpen] = useState(false)
  const isActive = (path: string) => location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(`${path}/`))
  const interior = navItems.some(item => item.path !== '/' && isActive(item.path))

  return (
    <nav
      className="marketing-navbar classic-surface sticky top-0 z-40 bg-classic-ink"
      role="navigation"
      aria-label="main navigation"
      data-menu-open={mobileOpen}
    >
      <NavbarGlass interior={interior} />
      <div className="marketing-nav-controls mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center" onClick={() => setMobileOpen(false)}>
          <BrandLogo className="h-8" />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive(item.path) ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
                isActive(item.path)
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}

        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={`${SOCIAL_ORIGIN.replace(/\/$/, '')}/search`}
            className="group flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Search"
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </a>
          <Button variant={classic ? 'outline' : 'brand'} size="sm" onClick={() => { trackFunnel('sign_in_click'); window.location.href = SOCIAL_ORIGIN }}>
            Open web10 social
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
            <Link to="/links" aria-label="Links">
              <LinkIcon className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Button>
          <GitHubStarButton />
        </div>

        <button
          className="flex h-11 w-11 items-center justify-center rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="marketing-nav-controls marketing-nav-menu flex flex-col gap-1 px-4 pb-4 pt-2 lg:hidden">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive(item.path) ? 'page' : undefined}
              className={`rounded-md px-3 py-3 text-sm font-medium ${
                isActive(item.path)
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <Button variant={classic ? 'outline' : 'brand'} size="sm" className="w-full justify-center" onClick={() => { setMobileOpen(false); trackFunnel('sign_in_click'); window.location.href = SOCIAL_ORIGIN }}>
              Open web10 social
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full justify-center">
              <Link to="/links" onClick={() => setMobileOpen(false)}>
                <LinkIcon className="h-4 w-4" strokeWidth={1.75} />
                Links
              </Link>
            </Button>
            <GitHubStarButton className="w-full justify-center" onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
