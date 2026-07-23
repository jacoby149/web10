import { useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bug, Menu, X } from 'lucide-react'
import { Button } from './ui/button'
import { trackFunnel } from '../lib/analytics'

const navItems = [
  { path: '/', label: 'Home' },
  { path: '/trending', label: 'Trending' },
  { path: '/docs', label: 'Docs' },
  { path: '/app-store', label: 'App Store' },
  { path: '/import', label: 'Import Your Life' },
]

function Navbar({ onReportBug }: { onReportBug: () => void }) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path))

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
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="outline" size="sm" onClick={onReportBug}>
            <Bug className="h-4 w-4" strokeWidth={1.75} />
            Report bug
          </Button>
          <Button variant="brand" size="sm" onClick={() => { trackFunnel('sign_in_click'); window.location.href = 'https://auth.web10.app' }}>
            Sign In
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { trackFunnel('github_click'); window.open('https://github.com/jacoby149/web10', '_blank', 'noopener') }}>
            GitHub
          </Button>
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
            <Button variant="brand" size="sm" className="w-full justify-center" onClick={() => { setMobileOpen(false); trackFunnel('sign_in_click'); window.location.href = 'https://auth.web10.app' }}>
              Sign In
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => { setMobileOpen(false); trackFunnel('github_click'); window.open('https://github.com/jacoby149/web10', '_blank', 'noopener') }}>
              GitHub
            </Button>
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
