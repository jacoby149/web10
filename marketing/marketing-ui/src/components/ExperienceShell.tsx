import { NavLink, Outlet } from 'react-router-dom';
import { Video, Clapperboard, Flame, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackFunnel } from '@/lib/analytics';

// The experience's nav (the content pyramid, least → most addictive): People
// → Posts → Video → Shorts. People is the conceptual tip (the "why there's a
// network here" — the directory), but it's profiles, not content, so **Posts
// is the default (the index)** — the ranked board, the actual content (the
// operator, 29.09.2026: "the people tab is kind of boring just a bunch of
// profiles not actual content, so by default have that second tab selected").
const destinations = [
  { to: '/trending/people', label: 'People', icon: Users, end: false, funnel: 'experience_people' },
  { to: '/trending', label: 'Posts', icon: Flame, end: true, funnel: 'experience_posts' },
  { to: '/trending/video', label: 'Video', icon: Video, end: false, funnel: 'experience_video' },
  { to: '/trending/shorts', label: 'Shorts', icon: Clapperboard, end: false, funnel: 'experience_shorts' },
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
