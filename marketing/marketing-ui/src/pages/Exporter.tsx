import { useEffect } from 'react';
import { ArrowUpRight, ArrowRight, Download, LogIn, UploadCloud, Server, Eye, BookOpen } from 'lucide-react';
import { trackFunnel } from '@/lib/analytics';
import { SOCIAL_ORIGIN } from '@/lib/origins';
import { EXPORT_LINKS } from '@/lib/exportLinks';

function StepCard({
  number,
  href,
  title,
  subtitle,
  icon: Icon,
  comingSoon,
  testid,
}: {
  number: number;
  href?: string;
  title: string;
  subtitle: string;
  icon: typeof Download;
  comingSoon?: boolean;
  testid: string;
}) {
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated font-mono text-sm font-semibold tabular-nums text-brand">
        {number}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <p className="font-display text-base font-semibold text-foreground">{title}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {subtitle}
          {comingSoon && (
            <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-[0.04em] text-warning">
              Coming Soon
            </span>
          )}
          {href && !comingSoon && (
            <ArrowUpRight
              className="ml-1 align-middle h-3.5 w-3.5 text-muted-foreground transition-colors duration-150 group-hover:text-brand"
              strokeWidth={1.75}
            />
          )}
        </p>
      </div>
    </>
  );

  if (href && !comingSoon) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={testid}
        className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-out hover:border-brand/50"
      >
        {inner}
      </a>
    );
  }

  return (
    <div data-testid={testid} className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 opacity-80">
      {inner}
    </div>
  );
}

function StepArrow() {
  return (
    <div className="hidden self-center text-muted-foreground sm:block">
      <ArrowRight className="h-5 w-5" strokeWidth={1.5} />
    </div>
  );
}

function PlatformButtons() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {EXPORT_LINKS.map(link => (
        <div key={link.platform} className="group flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center transition-colors duration-150 ease-out hover:border-brand/50">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`import-platform-${link.platform}`}
            className="flex flex-col items-center gap-2"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-lg font-semibold text-foreground">
              {link.label === 'X' ? '𝕏' : link.label.charAt(0)}
            </span>
            <span className="text-sm font-medium text-foreground">{link.label}</span>
            <ArrowUpRight
              className="mt-1 h-3 w-3 text-muted-foreground transition-colors duration-150 group-hover:text-brand"
              strokeWidth={1.75}
            />
          </a>
          <a
            href={`/docs/export-guidance#${link.guideAnchor}`}
            data-testid={`import-platform-${link.platform}-guide`}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-brand-300"
          >
            <BookOpen className="h-3 w-3" strokeWidth={1.5} />
            Guide
          </a>
        </div>
      ))}
    </div>
  );
}

function Web10ExportNote() {
  return (
    <div
      data-testid="import-web10-export-note"
      className="rounded-lg border border-brand-muted bg-brand-muted/20 p-4"
    >
      <p className="text-sm text-foreground">
        <strong>Yes, you can export from your current web10 node and import somewhere else.</strong>{' '}
        Your data is yours. Take it with you. No lock-in.
      </p>
    </div>
  );
}

function ImportStepStrip({ testidSuffix }: { testidSuffix?: string }) {
  const s = testidSuffix || '';
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
      <StepCard
        number={1}
        title="Export your data"
        subtitle="Download your export from any platform"
        icon={Download}
        testid={`import-step-1${s}`}
      />
      <StepArrow />
      <StepCard
        number={2}
        href={SOCIAL_ORIGIN}
        title="Log in"
        subtitle="Open the import tab"
        icon={LogIn}
        comingSoon
        testid={`import-step-2${s}`}
      />
      <StepArrow />
      <StepCard
        number={3}
        title="Upload the ZIP"
        subtitle="WeTransfer-style upload to our hosted storage"
        icon={UploadCloud}
        comingSoon
        testid={`import-step-3${s}`}
      />
      <StepArrow />
      <StepCard
        number={4}
        title="We process it"
        subtitle="Background pipeline, originals deleted after"
        icon={Server}
        comingSoon
        testid={`import-step-4${s}`}
      />
      <StepArrow />
      <StepCard
        number={5}
        title="Review & publish"
        subtitle="Privacy staging, then they're live"
        icon={Eye}
        comingSoon
        testid={`import-step-5${s}`}
      />
    </div>
  );
}

function Exporter() {
  useEffect(() => {
    trackFunnel('exporter_view');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="border-b border-border px-4 pt-24 pb-20 sm:px-6 sm:pt-32 sm:pb-28">
        <div className="mx-auto max-w-3xl">
          <p className="reveal text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            Import Your Life
          </p>
          <h1 className="reveal mt-4 font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-foreground [animation-delay:80ms] sm:text-5xl lg:text-[3.5rem]">
            Bring your social life to web10.
          </h1>
          <p className="reveal mt-6 max-w-xl text-lg leading-[1.6] text-muted-foreground [animation-delay:160ms]">
            Export your posts, photos, comments, and contacts from any
            platform. Click a link below, download your data, and we'll
            handle the rest.
          </p>

          {/* Step 1: platform buttons */}
          <div className="reveal mt-10 [animation-delay:240ms]">
            <h2 className="mb-4 font-display text-lg font-medium text-foreground">
              Step 1 — Export from your platform
            </h2>
            <PlatformButtons />
          </div>

          {/* web10 export note */}
          <div className="reveal mt-6 [animation-delay:320ms]">
            <Web10ExportNote />
          </div>

          {/* Full 5-step journey */}
          <div className="reveal mt-10 [animation-delay:400ms]">
            <h2 className="mb-4 font-display text-lg font-medium text-foreground">
              The full journey
            </h2>
            <ImportStepStrip />
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

export default Exporter;