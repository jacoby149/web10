import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import {startRectangles} from 'rectangles-npm'
import 'rectangles-npm/src/Rectangles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
startRectangles(document.getElementById('root'))