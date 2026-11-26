import type { ReactNode } from 'react'
import InteriorArtwork, { type InteriorArtworkKind } from './InteriorArtwork'

export default function InteriorIntro({ label, title, children, details, descriptionId, artwork }: {
  label: string
  title: string
  children: ReactNode
  details?: ReactNode
  descriptionId?: string
  artwork: InteriorArtworkKind
}) {
  return (
    <header className="mx-auto max-w-5xl px-5 pt-6 pb-6 sm:px-6 sm:pt-8 sm:pb-8">
      <div className="interior-intro grid items-center gap-3 overflow-hidden rounded-lg px-5 pt-5 pb-3 text-center sm:px-8 md:grid-cols-[minmax(0,6fr)_minmax(0,4fr)] md:gap-4 md:py-8 md:text-left">
        <div className="relative min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-300">{label}</p>
          <h1 className="mt-2 text-balance font-classic-display text-3xl leading-tight sm:text-4xl lg:text-5xl">{title}</h1>
          <p id={descriptionId} className="mx-auto mt-3 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground md:mx-0 sm:text-lg">
            {children}
          </p>
          {details}
        </div>
        <InteriorArtwork kind={artwork} />
      </div>
    </header>
  )
}
