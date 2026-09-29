import { NavLink, Outlet } from 'react-router-dom';
import { Video, Clapperboard, Flame, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackFunnel } from '@/lib/analytics';

// The experience's nav (watch-page.md, the Discover split): the four flat
// destinations — Video · Shorts · Hot Gossip · People — "YouTube but two more
// things on the sidebar than YouTube!" The first item is **Video**, not Home
// (the video wall is called what it is, because it *is* videos). The shell
// owns the nav; each destination is a flat route under `/` (the index is
// Video). The `TrendingSidebar` ("Top 10") is a *content* rail inside Hot
// Gossip, not this nav rail.

const destinations = [
  { to: '/', label: 'Video', icon: Video, end: true, funnel: 'experience_video' },
  { to: '/shorts', label: 'Shorts', icon: Clapperboard, end: false, funnel: 'experience_shorts' },
  { to: '/hot-gossip', label: 'Hot Gossip', icon: Flame, end: false, funnel: 'experience_hot_gossip' },
  { to: '/people', label: 'People', icon: Users, end: false, funnel: 'experience_people' },
] as const;

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    isActive
      ? 'bg-brand-muted text-brand-300'
      : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
  );

function ExperienceShell() {
  return (
    <div className="mx-auto flex w-full max-w-7xl">
      {/* Desktop — the nav sidebar (the four destinations). */}
      <aside
        data-testid="experience-nav"
        aria-label="Experience destinations"
        className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 self-start border-r border-border px-3 py-6 md:block"
      >
        <nav className="flex flex-col gap-1">
          {destinations.map(({ to, label, icon: Icon, end, funnel }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={itemClass}
              data-testid={`experience-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => trackFunnel(funnel)}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile — the same four destinations as a chip row (the sidebar has
            no room at 375px). Sticky under the top nav. */}
        <div
          data-testid="experience-nav-mobile"
          className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur-md md:hidden"
        >
          <div className="flex gap-1 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {destinations.map(({ to, label, icon: Icon, end, funnel }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-brand-muted text-brand-300'
                      : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
                  )
                }
                data-testid={`experience-nav-mobile-${label.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => trackFunnel(funnel)}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </div>
        </div>

        <Outlet />
      </div>
    </div>
  );
}

export default ExperienceShell;
