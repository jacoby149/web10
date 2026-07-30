import { useEffect } from 'react';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { trackFunnel } from '@/lib/analytics';
import { AUTH_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins';

function StepCard({
  number,
  href,
  title,
  subtitle,
  testid,
}: {
  number: number;
  href: string;
  title: string;
  subtitle: string;
  testid: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testid}
      className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-out hover:border-brand/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated font-mono text-sm font-semibold tabular-nums text-brand">
        {number}
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">
          {subtitle}
          <ArrowUpRight
            className="ml-1 align-middle h-3.5 w-3.5 transition-colors duration-150 group-hover:text-brand"
            strokeWidth={1.75}
          />
        </p>
      </div>
    </a>
  );
}

function StepArrow() {
  return (
    <div className="hidden self-center text-muted-foreground sm:block">
      <ArrowRight className="h-5 w-5" strokeWidth={1.5} />
    </div>
  );
}

function StepStrip({ justify, testidSuffix }: { justify?: string; testidSuffix?: string }) {
  const s = testidSuffix || '';
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center ${justify ? `sm:${justify}` : ''}`}>
      <StepCard
        number={1}
        href={SOCIAL_ORIGIN}
        title="Get the app"
        subtitle="Open web10 social"
        testid={`join-step-1${s}`}
      />
      <StepArrow />
      <StepCard
        number={2}
        href={SOCIAL_ORIGIN}
        title="Create your account"
        subtitle="Sign up — it's free"
        testid={`join-step-2${s}`}
      />
      <StepArrow />
      <StepCard
        number={3}
        href={`${AUTH_ORIGIN}?mode=studio`}
        title="Set up your monetization"
        subtitle="Open the Studio"
        testid={`join-step-3${s}`}
      />
      <StepArrow />
      <StepCard
        number={4}
        href={`${SOCIAL_ORIGIN}/feed`}
        title="Post to the feed"
        subtitle="Share your first post"
        testid={`join-step-4${s}`}
      />
    </div>
  );
}

function Join() {
  useEffect(() => {
    trackFunnel('join_view');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="border-b border-border px-4 pt-24 pb-20 sm:px-6 sm:pt-32 sm:pb-28">
        <div className="mx-auto max-w-3xl">
          <p className="reveal text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            Join web10
          </p>
          <h1 className="reveal mt-4 font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-foreground [animation-delay:80ms] sm:text-5xl lg:text-[3.5rem]">
            Never miss a post from your favorite creator again.
          </h1>
          <p className="reveal mt-6 max-w-xl text-lg leading-[1.6] text-muted-foreground [animation-delay:160ms]">
            You see 100% of what they make. Always. There is no algorithm
            between you and them — nothing promoted, nothing buried. Newest
            first. That's it.
          </p>

          {/* Four-step join flow */}
          <div className="reveal mt-10 [animation-delay:240ms]">
            <StepStrip />
          </div>
        </div>
      </section>

      {/* The Rise arc — the page skeleton */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            You're not joining the crowd.
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            You get your own page here too. Your own followers. Your own
            space. And your number is real — every follower you earn sees
            every post you make. Five thousand followers here means five
            thousand people actually see you.
          </p>
        </div>
      </section>

      {/* Step 1: Start free */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="reveal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              1
            </span>
            <div>
              <h3 className="reveal font-display text-xl font-semibold tracking-[-0.01em] text-foreground [animation-delay:80ms]">
                Start broke, start free.
              </h3>
              <p className="reveal mt-3 max-w-xl text-muted-foreground [animation-delay:160ms]">
                An account on your favorite creator's node. Their revenue
                pays for your infra — a free apartment in the coolest
                building in town.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2: Post */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="reveal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              2
            </span>
            <div>
              <h3 className="reveal font-display text-xl font-semibold tracking-[-0.01em] text-foreground [animation-delay:80ms]">
                Post. Your number is real.
              </h3>
              <p className="reveal mt-3 max-w-xl text-muted-foreground [animation-delay:160ms]">
                Every follower you earn actually sees you. No throttle, no
                lottery, no begging an algorithm for your own audience.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Get known */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="reveal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              3
            </span>
            <div>
              <h3 className="reveal font-display text-xl font-semibold tracking-[-0.01em] text-foreground [animation-delay:80ms]">
                Get known in the scene.
              </h3>
              <p className="reveal mt-3 max-w-xl text-muted-foreground [animation-delay:160ms]">
                The regulars know your name. Your 5k is really 5k. Local
                fame is legible and achievable — known in a community beats
                invisible to millions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 4: Pop off */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="reveal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              4
            </span>
            <div>
              <h3 className="reveal font-display text-xl font-semibold tracking-[-0.01em] text-foreground [animation-delay:80ms]">
                Pop off.
              </h3>
              <p className="reveal mt-3 max-w-xl text-muted-foreground [animation-delay:160ms]">
                Your following outgrows the scene. And by now it's paying
                you — members, sponsors. Not popping off? Switch nodes.
                Identity, content, and followers come with you. On the
                platforms, that option doesn't exist.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 5: Graduate */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="reveal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              5
            </span>
            <div>
              <h3 className="reveal font-display text-xl font-semibold tracking-[-0.01em] text-foreground [animation-delay:80ms]">
                Graduate.
              </h3>
              <p className="reveal mt-3 max-w-xl text-muted-foreground [animation-delay:160ms]">
                Your own node. Your own domain. Your own sponsors. Your
                data and your audience move with you, zero friction. Now
                you're the landlord hosting the next wave.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Safety line — quiet, second */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Delete means delete.
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            Your stuff is yours. Take it with you, wipe it, export it to
            your own drive. This isn't a permanent record waiting to be
            used against you someday. Nobody is mining you. The only
            sponsors you'll ever see are ones your creator chose and
            vouches for.
          </p>
        </div>
      </section>

      {/* Ownership */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Your creator owns the building.
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            No shadow bans. No demonetization. No terms-of-service
            massacre. This place exists as long as they want it to, and
            you're in it with them.
          </p>
        </div>
      </section>

      {/* Founding member */}
      <section className="border-b border-border px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            You found this place early.
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            That means something. Founding members are the reason it
            works.
          </p>
          <div className="reveal mt-10 [animation-delay:160ms]">
            <StepStrip justify="justify-center" testidSuffix="-bottom" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <span>&copy; {new Date().getFullYear()} web10</span>
          <div className="flex gap-6">
            <a href="/" className="hover:text-foreground">Home</a>
            <a href="/trending" className="hover:text-foreground">Trending</a>
            <a href="/docs" className="hover:text-foreground">Docs</a>
            <a href={SOCIAL_ORIGIN} className="hover:text-foreground">Sign In</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Join;