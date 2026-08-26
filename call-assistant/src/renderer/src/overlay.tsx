import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'
import { OverlayApp } from './overlay/OverlayApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
)
