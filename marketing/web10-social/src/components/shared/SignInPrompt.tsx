import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Home, LogIn, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Placement = 'sidebar' | 'feed' | 'following';

/** An invitation, never an auth gate over public content. App owns login. */
export function SignInPrompt({ placement, onLogin }: { placement: Placement; onLogin?: () => void }) {
  const headingId = useId();
  const following = placement === 'following';
  const sidebar = placement === 'sidebar';
  const Icon = following ? Home : Users;
  const heading = following ? 'Keep up with your people' : sidebar ? 'Make yourself at home' : 'Your people. All in one place.';
  const description = following
    ? 'Sign in to see posts from the people you follow. Your Following feed starts with them.'
    : sidebar
      ? 'Sign in to like posts, comment, and follow your people.'
      : 'Follow creators, join conversations, and share something of your own.';

  return (
    <section aria-labelledby={headingId} data-testid={`sign-in-prompt-${placement}`} className={cn(
      following ? 'mx-auto flex w-full max-w-xl flex-col items-center px-6 py-16 text-center md:py-24'
        : sidebar ? 'space-y-3 border-t border-border px-2 pt-5'
          : 'flex flex-col gap-4 rounded-lg border border-brand/20 bg-brand-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
    )}>
      {following && <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-muted"><Icon aria-hidden="true" className="h-10 w-10 text-brand-300" strokeWidth={1.5} /></div>}
      <div className={cn(!following && !sidebar && 'flex min-w-0 items-start gap-3')}>
        {!following && !sidebar && <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-muted sm:flex"><Icon aria-hidden="true" className="h-5 w-5 text-brand-300" /></div>}
        <div>
          <h2 id={headingId} className={cn('font-display font-medium text-foreground', following ? 'text-2xl' : sidebar ? 'text-base' : 'text-lg')}>{heading}</h2>
          <p className={cn('mt-2 text-sm leading-relaxed text-muted-foreground', following && 'max-w-md')}>{description}</p>
        </div>
      </div>
      <div className={cn('flex shrink-0 flex-col items-start gap-2', following && 'mt-6 items-center', !following && !sidebar && 'sm:items-center')}>
        <Button variant={sidebar ? 'brand_subtle' : 'brand'} onClick={() => {
          console.log('[social] sign-in invitation clicked:', placement);
          onLogin?.();
        }} className={cn('min-h-11 gap-2', !following && !sidebar && 'w-full sm:w-auto', sidebar && 'w-full')} data-testid={`sign-in-button-${placement}`}>
          <LogIn aria-hidden="true" className="h-4 w-4" /> Sign in
        </Button>
        <Link to="/join" data-testid={`sign-in-learn-${placement}`} className="inline-flex min-h-11 items-center rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-brand-300 hover:underline">
          New here? Get to know web10
        </Link>
      </div>
    </section>
  );
}
