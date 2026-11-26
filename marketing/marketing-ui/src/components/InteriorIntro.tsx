import type { ReactNode } from 'react'

export default function InteriorIntro({ label, title, children, details, descriptionId }: {
  label: string
  title: string
  children: ReactNode
  details?: ReactNode
  descriptionId?: string
}) {
  return (
    <header className="mx-auto max-w-5xl px-5 pt-8 pb-6 text-center sm:px-6 sm:pt-10 sm:pb-8">
      <p className="inline-block rounded-full bg-brand-muted px-3 py-1 text-xs font-medium uppercase tracking-widest text-brand-300">
        {label}
      </p>
      <h1 className="mt-3 text-balance font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p id={descriptionId} className="mx-auto mt-3 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
        {children}
      </p>
      {details}
    </header>
  )
}
