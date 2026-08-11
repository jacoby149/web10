import { useEffect } from 'react'
import {
  Smartphone,
  Globe,
  Code2,
  Users,
  Shield,
  Zap,
  ArrowRight,
  MessageCircle,
  ShoppingCart,
  CreditCard,
  Gamepad2,
  Radio,
  Store,
  Layers,
  Terminal,
} from 'lucide-react'
import { trackFunnel } from '../lib/analytics'
import { Button } from '../components/ui/button'
import { SOCIAL_ORIGIN } from '../lib/origins'

function Everything() {
  useEffect(() => {
    trackFunnel('everything_view')
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
            The everything app
          </p>
          <h1 className="reveal font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em] [animation-delay:80ms] sm:text-5xl lg:text-[3.5rem]">
            X wants to be America's WeChat.
            <br />
            <span className="text-brand">web10 wants to be the world's.</span>
          </h1>
          <p className="reveal mt-6 max-w-xl text-lg leading-[1.6] text-muted-foreground [animation-delay:160ms]">
            WeChat lets you chat, pay, shop, stream, game, and run your
            business — all in one app. But it's owned by one company,
            behind one government's firewall. web10 is the open-source
            everything app. No corporation. No country. Everyone owns it.
          </p>
          <div className="reveal mt-8 flex flex-wrap gap-3 [animation-delay:240ms]">
            <Button
              variant="brand"
              size="lg"
              onClick={() => { trackFunnel('sign_in_click'); window.location.href = SOCIAL_ORIGIN }}
              className="inline-flex items-center gap-2"
            >
              Start building <ArrowRight className="h-4 w-4" />
            </Button>
            <a href="https://github.com/jacoby149/web10" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="inline-flex items-center gap-2">
                <Terminal className="h-4 w-4" /> Open source
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            The everything app is a proven model
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            WeChat has 1.3 billion users. Not because it's a good chat
            app — because it's the operating system of daily life. You
            message, pay, order food, book rides, read news, play games,
            run a business. One app. No logins scattered across 20 services.
          </p>
          <p className="reveal mt-4 text-muted-foreground [animation-delay:120ms]">
            Musk wants X to be that for America. Same model, same
            ambition. Except X is still one company, one CEO, one
            shareholder class calling the shots. That's not freedom.
            That's swapping one landlord for another.
          </p>
        </div>
      </section>

      {/* The web10 model */}
      <section className="border-b border-border bg-surface/50 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            web10: the everything app everyone owns
          </h2>
          <p className="reveal mt-4 max-w-2xl text-muted-foreground [animation-delay:80ms]">
            Same ambition. Different model. web10 is open source. Anyone
            can build a web10 app. Every app interoperates on the
            protocol. The social app is the killer app, but it's not the
            only app. It's the front door.
          </p>

          <div className="reveal mt-12 grid gap-4 [animation-delay:160ms] sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                title: 'Social',
                desc: 'The killer app. Feed, DMs, groups, discover. 100% delivery, no algorithm.',
              },
              {
                icon: CreditCard,
                title: 'Payments',
                desc: 'Pay anyone, anywhere. No Stripe fees, no bank delays. Built on the protocol.',
              },
              {
                icon: ShoppingCart,
                title: 'Commerce',
                desc: 'Marketplace for goods, services, digital products. Your audience, your margins.',
              },
              {
                icon: Store,
                title: 'App Store',
                desc: 'Anyone can build a web10 app. PWA marketplace on social data. Interoperable by design.',
              },
              {
                icon: Radio,
                title: 'Livestream',
                desc: 'Real-time video, audio, interactive. No platform taking 50%.',
              },
              {
                icon: Gamepad2,
                title: 'Games',
                desc: 'Social games, mini-apps, interactive experiences. Your friends, your world.',
              },
              {
                icon: Zap,
                title: 'Flares',
                desc: 'Ephemeral stories, live moments. Bright signals you send up.',
              },
              {
                icon: Layers,
                title: 'Your apps',
                desc: 'Build anything on the protocol. Your users, your data, your rules.',
              },
              {
                icon: Globe,
                title: 'Global',
                desc: 'No country, no corporation. Self-host your node or use ours. Your choice.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-background p-5 transition-colors hover:border-brand/30 hover:bg-surface/50"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted">
                  <Icon className="h-5 w-5 text-brand-300" strokeWidth={1.5} />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            How it works
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            No corporate board. No terms of service. Just a protocol
            anyone can run, build on, and own.
          </p>

          <div className="reveal mt-10 space-y-8 [animation-delay:160ms]">
            {[
              {
                icon: Smartphone,
                title: 'You get the social app',
                desc: 'Sign up, import your life, start posting. Your data lives on your node. You control who sees it, who accesses it. Groups are the primitive — follows, communities, DMs, all the same thing under the hood.',
              },
              {
                icon: Code2,
                title: 'Anyone builds a web10 app',
                desc: 'The protocol is open. Build a payment app, a game, a marketplace, a streaming service. Use the SDK. Your app talks to the social app. Your users are web10 users. No walled garden, no app review board.',
              },
              {
                icon: Users,
                title: 'Everyone interoperates',
                desc: 'Your payment app works with my commerce app. Their game works with our social feed. The protocol guarantees it. No APIs to negotiate, no rate limits to hit, no "we deprecated v2" surprises.',
              },
              {
                icon: Shield,
                title: 'You own your node',
                desc: 'Self-host or use ours. Your data, your keys, your permissions. Service contracts let you grant access to apps you trust. Revoke anytime. No account bans, no shadow bans, no content moderation by committee.',
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="flex gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface/50">
                  <Icon className="h-5 w-5 text-brand-300" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-b border-border bg-surface/50 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Same ambition. Different soul.
          </h2>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            X wants to be the everything app for one country, owned by
            one person. WeChat is the everything app for one country,
            owned by one company. web10 is the everything app for
            everyone, owned by everyone.
          </p>

          <div className="reveal mt-10 overflow-x-auto [animation-delay:160ms]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 font-medium text-muted-foreground" />
                  <th className="pb-3 font-medium text-muted-foreground">WeChat</th>
                  <th className="pb-3 font-medium text-muted-foreground">X</th>
                  <th className="pb-3 font-semibold text-brand-300">web10</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {[
                  ['Owned by', 'Tencent (corporate)', 'Elon Musk (individual)', 'Everyone (open source)'],
                  ['Available in', 'China (firewalled)', 'Most countries', 'Everywhere (self-host)'],
                  ['Your data', 'Tencent\'s servers', 'X\'s servers', 'Your node'],
                  ['Build on it', 'Mini-programs (approved)', 'API (rate-limited)', 'Protocol (open)'],
                  ['App review', 'Tencent decides', 'X decides', 'No review needed'],
                  ['Revenue share', 'Tencent takes cut', 'X takes cut', 'You set your terms'],
                  ['Account bans', 'Yes', 'Yes', 'No (your keys)'],
                  ['Content moderation', 'Chinese government', 'CEO\'s tweet', 'Your groups, your rules'],
                ].map(([feature, wechat, x, web10]) => (
                  <tr key={feature as string} className="hover:bg-background/50">
                    <td className="py-3 font-medium text-foreground">{feature}</td>
                    <td className="py-3 text-muted-foreground">{wechat}</td>
                    <td className="py-3 text-muted-foreground">{x}</td>
                    <td className="py-3 font-medium text-brand-300">{web10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-background px-4 py-24 sm:px-6 sm:py-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-15 blur-[100px]"
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            The everything app shouldn't be owned by anyone.
          </h2>
          <p className="reveal mt-4 max-w-xl mx-auto text-lg leading-[1.6] text-muted-foreground [animation-delay:80ms]">
            It should be built by everyone. Run by everyone. Owned by
            everyone. That's web10.
          </p>
          <div className="reveal mt-8 flex flex-wrap justify-center gap-3 [animation-delay:160ms]">
            <Button
              variant="brand"
              size="lg"
              onClick={() => { trackFunnel('sign_in_click'); window.location.href = SOCIAL_ORIGIN }}
              className="inline-flex items-center gap-2"
            >
              Get the app <ArrowRight className="h-4 w-4" />
            </Button>
            <a href="/docs" className="inline-block">
              <Button variant="outline" size="lg" className="inline-flex items-center gap-2">
                <Code2 className="h-4 w-4" /> Build on web10
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Everything
