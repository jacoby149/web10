import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { SOCIAL_ORIGIN } from '../lib/origins'

// Compatibility only: discovery and its state now belong to social.
export function legacyTrendingUrl(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  const section = pathname.split('/')[2]
  const people = pathname === '/groups' || section === 'people' || params.get('tab') === 'profiles'
  const destination = people ? 'people' : section === 'video' ? 'video' : section === 'shorts' ? 'shorts' : 'feed'
  const target = new URL(`${SOCIAL_ORIGIN.replace(/\/$/, '')}/${destination}`)
  // Never copy credentials, API overrides, server preferences or arbitrary fields.
  for (const key of ['q', 'tag', 'post', 'knobs', ...(people ? ['section', 'peopleSort', 'groupSort'] : [])]) {
    const value = params.get(key)
    if (value) target.searchParams.set(key, value)
  }
  return target.href
}

export default function SocialRedirect() {
  const { pathname, search } = useLocation()
  const href = legacyTrendingUrl(pathname, search)
  const handedOff = useRef('')
  useEffect(() => {
    if (handedOff.current === href) return
    handedOff.current = href
    console.info('[marketing] legacy discovery handoff to social')
    window.location.replace(href)
  }, [href])
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-2xl font-bold">Opening web10 social…</h1>
      <a href={href} className="mt-6 inline-flex min-h-11 items-center text-brand-300 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Continue to web10 social</a>
    </main>
  )
}
