import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// @ts-ignore
import 'bulma/css/bulma.min.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
