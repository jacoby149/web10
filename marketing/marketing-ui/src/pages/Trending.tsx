import { FeedPreview } from '../components/FeedPreview'

function Trending() {
  return (
    <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center">
          <h1 className="reveal font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">
            Trending
          </h1>
          <p className="reveal mt-4 text-muted-foreground [animation-delay:80ms]">
            What's moving right now across the network.
          </p>
        </div>
        <FeedPreview />
      </div>
    </section>
  )
}

export default Trending
