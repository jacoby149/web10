import { useEffect, useState, useCallback } from 'react'
import { Info, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { fetchGraphData, GraphData } from '../lib/graphData'
import GraphViz from '../components/GraphViz'

function ExplainerPopover() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(v => !v)}
        className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
        aria-label="How does this work?"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="text-sm">How does this work?</span>
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-surface p-4 shadow-lg"
            role="dialog"
            aria-label="How does this graph work"
          >
            <p className="mb-3 text-sm leading-relaxed text-foreground">
              This is a separate app reading <strong className="text-brand-300">web10</strong> data —
              not the social app itself.
            </p>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Anon mode</strong> reads the public follow ledger —
              every follow is a public record anyone can query. Node sizes show follower count.
            </p>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              Click any node to visit that person's profile on the social app. Any developer can
              build something like this — apps are just lenses on your data.
            </p>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-7 text-xs"
              >
                Got it
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated">
        <ArrowRight className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-medium text-foreground">No follows yet</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        The graph starts empty and fills up as accounts join and follow each
        other. Each follow is a public record on the ledger — this app just
        reads what's there.
      </p>
    </div>
  )
}

function Graph() {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchGraphData()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">
              Social Graph
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data ? `${data.nodes.length} people · ${data.edges.length} follows` : 'Loading...'}
            </p>
          </div>
          <ExplainerPopover />
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Loading graph...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">Something went wrong loading the graph.</p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {data && !loading && data.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState />
          </div>
        )}

        {data && !loading && data.nodes.length > 0 && (
          <GraphViz data={data} className="h-full w-full" />
        )}
      </div>
    </div>
  )
}

export default Graph