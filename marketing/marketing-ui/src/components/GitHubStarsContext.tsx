import { createContext, useContext, useState, useEffect } from 'react'

const StarsContext = createContext<{ stars: number | null; loading: boolean }>({
  stars: null,
  loading: true,
})

function StarsProvider({ children }: { children: React.ReactNode }) {
  const [stars, setStars] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('https://api.github.com/repos/jacoby149/web10')
      .then(r => r.json())
      .then(d => {
        setStars(d.stargazers_count ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <StarsContext.Provider value={{ stars, loading }}>
      {children}
    </StarsContext.Provider>
  )
}

function useStars() {
  return useContext(StarsContext)
}

export { StarsProvider, useStars }