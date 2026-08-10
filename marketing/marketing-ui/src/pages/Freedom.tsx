import { useEffect } from 'react'
import { Shield, Lock, KeyRound, ArrowUpRight, Users, Server } from 'lucide-react'
import { trackFunnel } from '../lib/analytics'
import { SOCIAL_ORIGIN } from '../lib/origins'

function Freedom() {
  useEffect(() => {
    trackFunnel('freedom_view')
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-background px-4 pt-24 pb-20 sm:px-6 sm:pt-32 sm:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-16 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-brand opacity-20 blur-[120px]"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-start text-left">
          <p className="reveal text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            The internet freedom page
          </p>
          <h1 className="reveal font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em] [animation-delay:80ms] sm:text-5xl lg:text-[3.5rem]">
            The internet has a power problem.
          </h1>
          <p className="reveal mt-6 max-w-xl text-lg leading-[1.6] text-muted-foreground [animation-delay:160ms]">
            Not a content moderation problem. Not an algorithm problem. A
            power problem. On every platform, one company holds all the
            keys to your data, your audience, and your identity. You have
            a login and a terms of service. That's it.
          </p>
        </div>
      </section>

      {/* How it works now */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            How the internet works now
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            Every platform is the same structure. A central authority owns
            the data, controls the audience, and decides the rules. You
            don't have permissions — you have a login. You don't have
            ownership — you have a lease.
          </p>

          <div className="reveal mt-10 grid gap-6 [animation-delay:160ms] sm:grid-cols-2">
            {[
              {
                icon: Lock,
                title: 'They hold your data',
                desc: 'Your posts, messages, contacts — all stored on their servers. Export is a CSV if they feel generous. Delete is a promise they don\'t have to keep.',
              },
              {
                icon: Users,
                title: 'They control your audience',
                desc: 'A million followers, three hundred thousand shown. Not a bug — the business model. Your reach is their product, auctioned to the highest bidder.',
              },
              {
                icon: Shield,
                title: 'They can silence you',
                desc: 'Shadow ban. Demonetization. Account freeze. Terms-of-service change. You built an audience on rented land. The landlord can evict you anytime.',
              },
              {
                icon: Server,
                title: 'They mine you',
                desc: 'Your behavior is scanned, profiled, and sold. The only sponsors you see are ones the platform chose — not ones you chose. You are the product.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-lg border border-border bg-surface p-5"
              >
                <item.icon className="mt-1 h-5 w-5 shrink-0 text-brand-400" strokeWidth={1.5} />
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-[1.6] text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The missing layer */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            The missing layer
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            Enterprises have a system for controlling who touches their
            data. It's called IAM — Identity and Access Management.
            Per-app permissions. Scoped, expiring, revocable tokens. Kill
            switches. Role-based access. This is how companies protect
            their data.
          </p>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:160ms]">
            It doesn't exist for individuals. Until now.
          </p>

          <div className="reveal mt-10 rounded-lg border border-border bg-surface p-6 [animation-delay:240ms]">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-1 h-5 w-5 shrink-0 text-brand-400" strokeWidth={1.5} />
              <div>
                <h3 className="font-display text-base font-semibold text-foreground">
                  User-level IAM
                </h3>
                <p className="mt-2 text-sm leading-[1.6] text-muted-foreground">
                  Every actor — app, agent, LLM — acts under a token the
                  user minted. Per-app, per-service, per-operation. The
                  user approves or denies. One click revokes an app.
                  Another revokes everything. No website touches your
                  data without your explicit permission.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The honest truth */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            The honest truth
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            web10 isn't a utopia. It's a much flatter structure. Right
            now, a creator joins a platform and builds an audience on
            rented land. The platform owns the building.
          </p>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:160ms]">
            On web10, creators own the building. They host their audience,
            monetize directly, and keep what they earn. Their fans get
            free accounts — the creator's revenue pays for infrastructure.
            It's still a host-and-audience relationship. But the difference
            is structural.
          </p>

          <div className="reveal mt-10 grid gap-6 [animation-delay:240ms] sm:grid-cols-2">
            {[
              {
                title: 'Power can\'t lock in',
                desc: 'Anyone in the building can walk out and build their own. Identity, content, and followers are portable. The hierarchy can\'t harden because the escape hatch is real — one docker compose up.',
              },
              {
                title: 'The host can\'t abuse you',
                desc: 'Your data is yours. Your permissions are yours. The creator hosts your account, but they don\'t own your data. You control who touches it — including them. Kill switch for everything.',
              },
              {
                title: 'Graduation is built in',
                desc: 'Start as a fan. Build an audience. Graduate to your own node, your own domain, your own sponsors. The system is designed for upward mobility — not just for creators, but for everyone.',
              },
              {
                title: 'No central authority',
                desc: 'There is no web10 Inc. that can deplatform you. There is no terms-of-service massacre waiting to happen. Each node is independent. The protocol is open. The reference implementation is one valid node, not the only one.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h3 className="font-display text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-[1.6] text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What changes */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            What changes
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            This isn't about a better feed. This is about who holds power
            on the internet. When a platform owns your audience, it owns
            you. When you own the permission layer, nothing can touch what
            you haven't authorized.
          </p>

          <div className="reveal mt-10 flex flex-col gap-4 [animation-delay:160ms]">
            {[
              'You own your data. Export it, move it, erase it. Delete means delete.',
              'You control what apps touch it. Per-app, per-service, per-operation. Revoke in one click.',
              'You control what people see it. Groups define who can discover your content. Remove someone, remove yourself, or remove the content — it\'s gone for everyone. Delete is universal, not personal.',
              'Your identity is portable. Username, content, followers — they move with you across nodes.',
              'Your audience is real. 100% delivery isn\'t a feature — it\'s what happens when nobody holds the throttle.',
              'The escape hatch is real. Self-hostable nodes. One command. Hardware you own.',
            ].map((line, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <p className="text-base leading-[1.6] text-foreground">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Why it matters
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            The internet was supposed to be decentralized. Instead, power
            concentrated into a handful of companies that control what you
            see, who you reach, and how you're treated. They can change the
            rules anytime. You can't.
          </p>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:160ms]">
            web10 flips that. Not through policy. Not through promises.
            Through architecture. The user owns their own database. Every
            actor acts under a scoped, expiring, revocable token. The node
            is self-hostable. There is no central authority that can
            deplatform you — because you are the authority.
          </p>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:240ms]">
            That's not a feature. That's sovereignty.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            The keys are yours.
          </h2>
          <p className="reveal mt-4 max-w-xl text-lg leading-[1.6] text-muted-foreground [animation-delay:80ms]">
            This isn't a product pitch. It's an architecture. And it's
            open.
          </p>
          <div className="reveal mt-10 flex flex-col items-center gap-4 [animation-delay:160ms] sm:flex-row sm:justify-center">
            <a
              href={SOCIAL_ORIGIN}
              className="group inline-flex items-center gap-2 rounded-lg border border-brand bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 hover:bg-brand-600"
            >
              Enter web10
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
            </a>
            <a
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-brand/40 hover:bg-elevated"
            >
              Read the protocol
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <span>&copy; {new Date().getFullYear()} web10</span>
          <div className="flex gap-6">
            <a href="/" className="hover:text-foreground">Home</a>
            <a href="/freedom" className="hover:text-foreground">Freedom</a>
            <a href="/docs" className="hover:text-foreground">Docs</a>
            <a href="/join" className="hover:text-foreground">Join</a>
            <a href={SOCIAL_ORIGIN} className="hover:text-foreground">Sign In</a>
            <a href="https://github.com/jacoby149/web10" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Freedom