import { ExternalLink, BookOpen, Store, MessageCircle, Shield, TrendingUp, FileCode } from 'lucide-react'
import { Card } from '../components/ui/card'
import { API_ORIGIN, SOCIAL_ORIGIN, AUTH_ORIGIN } from '../lib/origins'

const MARKETING_API_ORIGIN = (import.meta.env as any).VITE_MARKETING_API_URL || 'https://marketing-api.web10.app'

interface LinkItem {
  name: string
  description: string
  href: string
  icon: typeof ExternalLink
}

function getLinks(): LinkItem[] {
  const api = API_ORIGIN.replace(/\/$/, '')
  const social = SOCIAL_ORIGIN.replace(/\/$/, '')
  const auth = AUTH_ORIGIN.replace(/\/$/, '')
  const marketingApi = MARKETING_API_ORIGIN.replace(/\/$/, '')

  return [
    {
      name: 'Social App',
      description: 'The web10 social media platform',
      href: social,
      icon: MessageCircle,
    },
    {
      name: 'Authenticator',
      description: 'Login, signup, service contracts',
      href: auth,
      icon: Shield,
    },
    {
      name: 'App Store',
      description: 'Browse and discover web10 apps',
      href: '/app-store',
      icon: Store,
    },
    {
      name: 'Trending',
      description: 'Public discovery board',
      href: '/trending',
      icon: TrendingUp,
    },
    {
      name: 'API Docs',
      description: 'Swagger documentation for the v3 API',
      href: `${api}/docs`,
      icon: BookOpen,
    },
    {
      name: 'Marketing API Docs',
      description: 'Analytics, import, feedback endpoints',
      href: `${marketingApi}/docs`,
      icon: FileCode,
    },
    {
      name: 'Developer Docs',
      description: 'Protocol spec, SDK guide, conventions',
      href: '/docs',
      icon: BookOpen,
    },
  ]
}

export default function LinksPage() {
  const links = getLinks()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            web10
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything in one place
          </p>
        </div>

        <div className="mt-12 space-y-4">
          {links.map((link) => (
            <Card key={link.name} className="overflow-hidden transition-shadow hover:shadow-md">
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 sm:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-muted">
                  <link.icon className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{link.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{link.description}</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              </a>
            </Card>
          ))}
        </div>

        <p className="mt-16 text-center text-xs text-muted-foreground">
          Built on the web10 protocol — user-level IAM, groups as the primitive, 100% delivery.
        </p>
      </div>
    </div>
  )
}
