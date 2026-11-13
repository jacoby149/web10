import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, Flame, KeyRound, Music, Palette, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeMark } from '@/components/shared/ThemeMark';

const destinations = [
  { label: 'Posts', description: 'Start a conversation.', path: '/feed', icon: Flame },
  { label: 'Video', description: 'Stay for the whole story.', path: '/video', icon: Video },
  { label: 'Shorts', description: 'Find your next favorite.', path: '/shorts', icon: Clapperboard },
  { label: 'Music', description: 'Make yourself a playlist.', path: '/music', icon: Music },
];

/** Public conversion entry. Authentication belongs to App's existing handler. */
export default function JoinScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-background text-foreground" data-testid="join-screen">
      <div aria-hidden="true" className="pointer-events-none absolute -right-48 top-0 -z-10 h-96 w-96 rounded-full bg-glow blur-3xl" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <header className="flex min-h-24 items-center justify-between gap-4 border-b border-border/60">
          <Link to="/join" aria-label="web10 social home" className="flex min-h-11 items-center gap-3 rounded-sm">
            <ThemeMark className="h-10 w-10" />
            <span className="font-display text-lg font-medium tracking-tight">web10 social</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="min-h-11 min-w-11">
              <Link to="/appearance" aria-label="Appearance"><Palette className="h-5 w-5" /></Link>
            </Button>
            <Button variant="outline" className="min-h-11" onClick={onLogin} data-testid="join-sign-in">Sign in</Button>
          </nav>
        </header>

        <main>
          <section aria-labelledby="join-heading" className="grid items-center gap-12 py-12 md:py-20 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-brand-300">
                <KeyRound aria-hidden="true" className="h-4 w-4" /> Social. On your terms.
              </p>
              <h1 id="join-heading" className="font-display text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
                Your people.<br /><span className="text-brand-300">Your space.</span>
              </h1>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
                The posts, videos, and music you came for. The people you want to keep up with.
                A place to make something of your own.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3">
                <Button variant="brand" size="lg" className="min-h-12 w-full gap-3 sm:w-auto" onClick={onLogin} data-testid="join-button">
                  Join web10 social <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
                <p className="text-sm text-muted-foreground">Free to join. Create an account or use your web10 login.</p>
              </div>
              <Button asChild variant="ghost" className="mt-4 min-h-11 gap-2 px-0 hover:bg-transparent hover:text-brand-300">
                <Link to="/feed" data-testid="join-explore">Explore first <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-4 border-b border-border bg-linear-to-br from-brand-muted/50 to-surface p-6 sm:p-8">
                <ThemeMark className="h-16 w-16" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-brand-300">Not just a feed</p>
                  <h2 className="mt-2 font-display text-2xl font-medium">A whole place to belong.</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:p-6">
                {destinations.map(({ label, description, path, icon: Icon }) => (
                  <Link key={path} to={path} className="group rounded border border-border bg-background p-4 transition-colors hover:border-brand/60 hover:bg-elevated motion-reduce:transition-none" data-testid={`join-${label.toLowerCase()}`}>
                    <Icon aria-hidden="true" className="mb-6 h-6 w-6 text-brand-300" />
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{label}</h3>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground group-hover:text-brand-300" />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </Link>
                ))}
              </div>
              <p className="flex items-center gap-3 border-t border-border px-6 py-4 text-sm text-muted-foreground">
                <Users aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-300" />
                Come for a creator. Find your people. Share your own thing.
              </p>
            </div>
          </section>

          <section aria-label="Make it yours" className="grid gap-8 border-t border-border py-8 sm:grid-cols-3 sm:py-12">
            <div><h2 className="font-display text-lg font-medium">More than a username.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your profile, your posts, your corner of the internet.</p></div>
            <div><h2 className="font-display text-lg font-medium">Keep your people close.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Follow creators, join conversations, and make connections.</p></div>
            <div><h2 className="font-display text-lg font-medium">No download required.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Open it in your browser. At your desk or on your phone.</p></div>
          </section>
        </main>

        <footer className="flex flex-col justify-between gap-4 border-t border-border py-6 text-xs leading-relaxed text-muted-foreground sm:flex-row">
          <p>Joining opens web10 login in a separate window.<br />You review the app’s access before getting started.</p>
          <div className="flex items-start gap-6">
            <a href="https://web10.app/docs/terms" className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground">Terms</a>
            <a href="https://web10.app/docs/privacy" className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground">Privacy</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
