import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import OAuthConsent from './OAuthConsent.jsx'
import './styles.css'

const isOAuthConsent = window.location.pathname === '/oauth/consent'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isOAuthConsent ? <OAuthConsent /> : <App />}
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Service Worker registered'))
      .catch((err) => console.log('Service Worker failed:', err))
  })
}
