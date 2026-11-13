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
  const feed = placement === 'feed';
  const mobileHeading = 'Make yourself at home';
  const mobileDescription = 'Sign in to like posts, comment, and follow your people.';
  const Icon = following ? Home : Users;
  const heading = following ? 'Keep up with your people' : sidebar ? mobileHeading : 'Your people. All in one place.';
  const description = following
    ? 'Sign in to see posts from the people you follow. Your Following feed starts with them.'
    : sidebar
      ? mobileDescription
      : 'Follow creators, join conversations, and share something of your own.';

  return (
    <section aria-labelledby={headingId} data-testid={`sign-in-prompt-${placement}`} className={cn(
      following ? 'mx-auto flex w-full max-w-xl flex-col items-center px-6 py-16 text-center md:py-24'
        : sidebar ? 'space-y-3 border-t border-border px-2 pt-5'
          : 'flex flex-col gap-3 rounded-lg border border-brand/20 bg-brand-muted/20 p-4 md:flex-row md:items-center md:justify-between md:gap-4 md:p-5',
    )}>
      {following && <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-muted"><Icon aria-hidden="true" className="h-10 w-10 text-brand-300" strokeWidth={1.5} /></div>}
      <div className={cn(feed && 'flex min-w-0 items-start gap-3')}>
        {feed && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-muted md:h-11 md:w-11"><Icon aria-hidden="true" className="h-5 w-5 text-brand-300" /></div>}
        <div className={feed ? 'min-w-0' : undefined}>
          <h2 id={headingId} className={cn('font-display font-medium text-foreground', following ? 'text-2xl' : sidebar ? 'text-base' : 'text-base md:text-lg')}>
            {feed ? <><span className="md:hidden">{mobileHeading}</span><span className="hidden md:inline">{heading}</span></> : heading}
          </h2>
          <p className={cn('mt-2 text-sm leading-relaxed text-muted-foreground', following && 'max-w-md')}>
            {feed ? <><span className="md:hidden">{mobileDescription}</span><span className="hidden md:inline">{description}</span></> : description}
          </p>
        </div>
      </div>
      <div className={cn('flex shrink-0 gap-2', feed ? 'flex-row items-center justify-between gap-3 md:flex-col md:items-center md:gap-2' : 'flex-col items-start', following && 'mt-6 items-center')}>
        <Button variant={sidebar ? 'brand_subtle' : 'brand'} onClick={() => {
          console.log('[social] sign-in invitation clicked:', placement);
          onLogin?.();
        }} className={cn('min-h-11 gap-2', feed && 'shrink-0 md:w-auto', sidebar && 'w-full')} data-testid={`sign-in-button-${placement}`}>
          <LogIn aria-hidden="true" className="h-4 w-4" /> Sign in
        </Button>
        <Link to="/join" data-testid={`sign-in-learn-${placement}`} className="inline-flex min-h-11 items-center rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-brand-300 hover:underline">
          New here? Get to know web10
        </Link>
      </div>
    </section>
  );
}
