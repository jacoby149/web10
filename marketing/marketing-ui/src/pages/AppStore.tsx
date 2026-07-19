import { Users, LayoutDashboard, Briefcase, Mail, Upload, BookOpen } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

// First-party proof, not a catalog — the app store frames "built on web10",
// it doesn't pretend a marketplace of third-party apps exists yet
// (design.md §10: "Do NOT fake a big catalog").
const FIRST_PARTY_APPS = [
  {
    icon: Users,
    name: 'web10 social',
    description:
      'The flagship lens: an instagram-shaped feed, DMs, and media — the app that proves the protocol stands on its own.',
    source: 'https://github.com/jacoby149/web10/tree/main/marketing/web10-social',
  },
  {
    icon: LayoutDashboard,
    name: 'The node console',
    description:
      'Every node runs this: login, consent, terms, and the Studio — the operator surface for a self-hosted web10 node.',
    source: 'https://github.com/jacoby149/web10/tree/main/ui',
  },
  {
    icon: Briefcase,
    name: 'CRM',
    description: 'A sub-app inside web10 social for managing fan and business contacts on your own data.',
    source: 'https://github.com/jacoby149/web10/tree/main/marketing/web10-social',
  },
  {
    icon: Mail,
    name: 'Mail',
    description: 'A sub-app inside web10 social for messaging that lives in your collection, not a platform inbox.',
    source: 'https://github.com/jacoby149/web10/tree/main/marketing/web10-social',
  },
  {
    icon: Upload,
    name: 'The importer',
    description: 'Brings your Instagram, Facebook, and YouTube history into your node in one pass — see it in action on the Import page.',
    source: '/import',
  },
]

function AppStore() {
  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="reveal text-center">
          <Badge variant="brand">Built on web10</Badge>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            One protocol. A growing set of apps.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            These are the first-party apps running on the web10 protocol today —
            proof it's a real stack, not a pitch deck.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {FIRST_PARTY_APPS.map((app, i) => (
            <Card
              key={app.name}
              className={`reveal bg-surface ${i % 2 === 0 ? '[animation-delay:0ms]' : '[animation-delay:80ms]'}`}
            >
              <CardHeader>
                <app.icon className="mb-2 h-6 w-6 text-brand-400" strokeWidth={1.5} />
                <CardTitle>{app.name}</CardTitle>
                <CardDescription>{app.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                <a
                  href={app.source}
                  className="text-sm text-brand-300 underline-offset-4 hover:text-brand-400 hover:underline"
                  {...(app.source.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {app.source.startsWith('http') ? 'View source' : 'Try it'}
                </a>
              </CardFooter>
            </Card>
          ))}

          <Card className="reveal flex flex-col justify-between border-brand-muted bg-brand-muted/20 [animation-delay:160ms]">
            <CardHeader>
              <BookOpen className="mb-2 h-6 w-6 text-brand-300" strokeWidth={1.5} />
              <CardTitle>Build on web10</CardTitle>
              <CardDescription>
                One MongoDB collection per user, a tiny CRUD API, a scoped token.
                Read the protocol spec and build the next app.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="brand" size="sm">
                <a href="/docs/protocol-spec">Read the docs</a>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AppStore
