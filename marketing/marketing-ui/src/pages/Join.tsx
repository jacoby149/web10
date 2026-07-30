import { useEffect } from 'react';
import { Key, Wallet, Send, ArrowUpRight } from 'lucide-react';
import { trackFunnel } from '@/lib/analytics';
import { AUTH_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins';

const steps = [
  {
    number: 1,
    href: SOCIAL_ORIGIN,
    title: 'Get the app',
    subtitle: 'Open web10 social',
    icon: 'pwa',
  },
  {
    number: 2,
    href: AUTH_ORIGIN,
    title: 'Create your account',
    subtitle: "Sign up — it's free",
    icon: 'key',
  },
  {
    number: 3,
    href: `${AUTH_ORIGIN}?mode=studio`,
    title: 'Set up your monetization',
    subtitle: 'Open the Studio',
    icon: 'wallet',
  },
  {
    number: 4,
    href: `${SOCIAL_ORIGIN}/feed`,
    title: 'Post to the feed',
    subtitle: 'Share your first post',
    icon: 'send',
  },
] as const;

const iconMap = {
  key: Key,
  wallet: Wallet,
  send: Send,
};

function StepCard({
  number,
  href,
  title,
  subtitle,
  icon,
  testid,
}: {
  number: number;
  href: string;
  title: string;
  subtitle: string;
  icon: 'pwa' | 'key' | 'wallet' | 'send';
  testid: string;
}) {
  const Icon = iconMap[icon];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testid}
      className="group relative flex items-center gap-4 rounded-lg border border-border bg-surface p-4 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:bg-elevated"
    >
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-elevated">
        {icon === 'pwa' ? (
          <img
            src="/brand/icon-192.png"
            alt=""
            className="h-10 w-10 object-contain"
          />
        ) : Icon ? (
          <Icon className="h-6 w-6 text-brand-400" strokeWidth={1.5} />
        ) : null}
        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-brand text-[0.625rem] font-bold leading-none text-background">
          {number}
        </span>
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">
          {subtitle}
          <ArrowUpRight
            className="ml-1 inline-block align-middle h-3.5 w-3.5 transition-colors duration-150 group-hover:text-brand"
            strokeWidth={1.75}
          />
        </p>
      </div>
    </a>
  );
}

function StepArrow() {
  return (
    <div className="hidden self-center sm:flex sm:items-center">
      <svg
        width="32"
        height="2"
        viewBox="0 0 32 2"
        fill="none"
        className="text-muted-foreground/30"
      >
        <line
          x1="0"
          y1="1"
          x2="24"
          y2="1"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="text-muted-foreground/50"
      >
        <path
          d="M4.5 3L7.5 6L4.5 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function StepStrip({ justify, testidSuffix }: { justify?: string; testidSuffix?: string }) {
  const s = testidSuffix || '';
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center ${justify ? `sm:${justify}` : ''}`}>
      {steps.map((step, i) => (
        <span key={step.number}>
          {i > 0 && <StepArrow />}
          <StepCard
            number={step.number}
            href={step.href}
            title={step.title}
            subtitle={step.subtitle}
            icon={step.icon}
            testid={`join-step-${step.number}${s}`}
          />
        </span>
      ))}
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
            <a href={AUTH_ORIGIN} className="hover:text-foreground">Sign In</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Join;