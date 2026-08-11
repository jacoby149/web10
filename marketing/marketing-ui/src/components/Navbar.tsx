import { useState, useCallback, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bug, Menu, X, Search, Link as LinkIcon, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import GitHubStarButton from './GitHubStarButton'
import { trackFunnel } from '../lib/analytics'
import { SOCIAL_ORIGIN } from '../lib/origins'

const navItems = [
  { path: '/', label: 'Home' },
  { path: '/trending', label: 'Trending' },
  { path: '/app-store', label: 'App Store' },
  { path: '/import', label: 'Import Your Life' },
  { path: '/join', label: 'Join' },
]

const learnItems = [
  { path: '/freedom', label: 'Freedom' },
  { path: '/everything', label: 'The Everything App' },
  { path: '/docs', label: 'Docs' },
]

function Navbar({ onReportBug }: { onReportBug: () => void }) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [learnOpen, setLearnOpen] = useState(false)
  const learnRef = useRef<HTMLDivElement>(null)
  const learnTimer = useRef<ReturnType<typeof setTimeout>>()

  const openLearn = useCallback(() => {
    clearTimeout(learnTimer.current)
    setLearnOpen(true)
  }, [])

  const closeLearn = useCallback(() => {
    learnTimer.current = setTimeout(() => setLearnOpen(false), 100)
  }, [])

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path))

  const isLearnActive = learnItems.some(item => isActive(item.path))

  useEffect(() => {
    if (!learnOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLearnOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      clearTimeout(learnTimer.current)
    }
  }, [learnOpen])

  useEffect(() => () => clearTimeout(learnTimer.current), [])

  return (
    <nav
      className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm"
      role="navigation"
      aria-label="main navigation"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center" onClick={() => setMobileOpen(false)}>
          <img src="/brand/logo-lockup.png" className="h-7" alt="web10" />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
                isActive(item.path)
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}

          {/* Learn dropdown */}
          <div
            ref={learnRef}
            className="relative"
            onMouseEnter={openLearn}
            onMouseLeave={closeLearn}
          >
            <button
              onClick={() => setLearnOpen(v => !v)}
              className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
                isLearnActive
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
              }`}
              aria-expanded={learnOpen}
              aria-haspopup="true"
            >
              Learn
              <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${learnOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>
            {learnOpen && (
              <div className="absolute left-0 top-full w-44 overflow-hidden rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-lg">
                {learnItems.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setLearnOpen(false)}
                    className={`block px-3 py-2.5 text-sm transition-colors duration-150 ${
                      isActive(item.path)
                        ? 'bg-brand-muted text-brand-300'
                        : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            to="/trending?focus=search"
            className="group flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Search"
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </Link>
          <Button variant="outline" size="sm" onClick={onReportBug}>
            <Bug className="h-4 w-4" strokeWidth={1.75} />
            Report bug
          </Button>
          <Button variant="brand" size="sm" onClick={() => { trackFunnel('sign_in_click'); window.location.href = SOCIAL_ORIGIN }}>
            Sign In
          </Button>
          <Link to="/links">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <LinkIcon className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </Link>
          <GitHubStarButton />
        </div>

        <button
          className="flex h-11 w-11 items-center justify-center rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="flex flex-col gap-1 border-t border-border px-4 pb-4 pt-2 md:hidden">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`rounded-md px-3 py-3 text-sm font-medium ${
                isActive(item.path)
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="rounded-md border border-border p-1">
            <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Learn
            </p>
            {learnItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`block rounded-sm px-3 py-2.5 text-sm font-medium ${
                  isActive(item.path)
                    ? 'bg-brand-muted text-brand-300'
                    : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() => { setMobileOpen(false); onReportBug() }}
            >
              <Bug className="h-4 w-4" strokeWidth={1.75} />
              Report bug
            </Button>
            <Button variant="brand" size="sm" className="w-full justify-center" onClick={() => { setMobileOpen(false); trackFunnel('sign_in_click'); window.location.href = SOCIAL_ORIGIN }}>
              Sign In
            </Button>
            <Link to="/links" onClick={() => setMobileOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-center">
                <LinkIcon className="h-4 w-4" strokeWidth={1.75} />
                Links
              </Button>
            </Link>
            <GitHubStarButton className="w-full justify-center" onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
