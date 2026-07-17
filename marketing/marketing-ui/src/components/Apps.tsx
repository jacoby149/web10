import { useEffect, useState } from 'react'

const API_URL = window.location.protocol === 'https:'
  ? 'https://api.web10.app'
  : 'http://api.localhost'

interface AppData {
  href: string
  title: string
  img: string | null
  hits: number
}

function useAppListing(initApp: { href: string; hits: number }) {
  const [app, setApp] = useState<AppData>({
    href: initApp.href,
    title: initApp.href,
    img: null,
    hits: initApp.hits,
  })

  useEffect(() => {
    fetch(`${API_URL}/pwa_listing?url=${initApp.href}`)
      .then(r => r.json())
      .then(data => {
        const icons = data.icons
        const icon = icons && icons.length > 0 ? icons[icons.length - 1].src : null
        setApp(prev => ({
          ...prev,
          title: data.name || prev.title,
          img: icon ? `${initApp.href}${icon}` : null,
        }))
      })
      .catch(() => {})
  }, [initApp.href])

  return app
}

function AppListing({ initApp }: { initApp: { href: string; hits: number } }) {
  const app = useAppListing(initApp)
  const placeholderImg = 'https://bulma.io/images/placeholders/128x128.png'

  return (
    <div
      onClick={() => window.open(app.href, '_blank')}
      className="box"
      style={{ margin: '0 10px 20px 10px', backgroundColor: 'transparent', cursor: 'pointer' }}
    >
      <div className="card-image">
        <figure className="image is-2by2">
          <img
            style={{ borderRadius: '10px' }}
            src={app.img || placeholderImg}
            alt={app.title}
          />
        </figure>
      </div>
      <article className="media">
        <div className="media-content">
          <div className="content" style={{ marginTop: '10px' }}>
            <p>
              <strong>{app.title}</strong>
              <br />
              <small>{app.hits} hits</small>
            </p>
          </div>
        </div>
      </article>
    </div>
  )
}

function Apps({ apps }: { apps: { href: string; hits: number }[] }) {
  return (
    <div className="columns is-multiline is-centered">
      {apps.map((initApp, index) => (
        <div key={index} className="column is-one-fifth" style={{ width: '180px' }}>
          <AppListing initApp={initApp} />
        </div>
      ))}
    </div>
  )
}

export { Apps }
