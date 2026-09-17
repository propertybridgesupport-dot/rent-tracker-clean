import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const styles = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'linear-gradient(180deg, #f8f6f3 0%, #f3ede7 100%)', boxSizing: 'border-box' },
  card: { width: '100%', maxWidth: '620px', background: '#fff', border: '1px solid #eadfce', borderRadius: '24px', padding: '30px', boxShadow: '0 14px 36px rgba(71, 15, 67, 0.12)', boxSizing: 'border-box' },
  eyebrow: { color: '#8c6d45', fontSize: '12px', fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', margin: '0 0 10px' },
  title: { color: '#7b0f73', margin: '0 0 12px', fontSize: '30px', lineHeight: 1.15 },
  text: { color: '#5b4a3b', lineHeight: 1.55 },
  panel: { background: '#fffaf6', border: '1px solid #eadfce', borderRadius: '16px', padding: '16px', margin: '18px 0' },
  input: { width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #d9c2cf', marginTop: '6px', marginBottom: '12px', fontSize: '15px' },
  row: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' },
  allow: { background: '#7b0f73', color: '#fff', border: 0, borderRadius: '12px', padding: '12px 18px', fontWeight: 700, cursor: 'pointer' },
  deny: { background: '#f3e7d7', color: '#5b3b18', border: '1px solid #e2c59c', borderRadius: '12px', padding: '12px 18px', fontWeight: 700, cursor: 'pointer' },
  error: { color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px', marginTop: '14px' },
}

function clientName(details) {
  return details?.client?.name || details?.client?.client_name || 'ChatGPT'
}

export default function OAuthConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const [user, setUser] = useState(null)
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('Checking your secure connection request…')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!authorizationId) {
        if (active) {
          setError('This connection request is missing its authorization ID.')
          setStatus('')
        }
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!active) return
      setUser(userData.user || null)

      if (!userData.user) {
        setStatus('')
        return
      }

      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (!active) return
      if (detailsError || !data) {
        setError('This connection request is invalid or has expired.')
        setStatus('')
        return
      }

      if (!('authorization_id' in data) && data.redirect_url) {
        window.location.assign(data.redirect_url)
        return
      }

      setDetails(data)
      setStatus('')
    }

    load()
    return () => { active = false }
  }, [authorizationId])

  async function signIn(event) {
    event.preventDefault()
    setWorking(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('Sign-in failed. Check your email and password and try again.')
      setWorking(false)
      return
    }
    window.location.reload()
  }

  async function decide(approved) {
    setWorking(true)
    setError('')
    const result = approved
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)

    if (result.error || !result.data?.redirect_url) {
      setError('The connection decision could not be completed. Please try again.')
      setWorking(false)
      return
    }

    window.location.assign(result.data.redirect_url)
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>Private assistant connection</p>
        <h1 style={styles.title}>Connect Money Command Center</h1>

        {status && <p style={styles.text}>{status}</p>}

        {!status && !user && !error && (
          <>
            <p style={styles.text}>Sign in with your existing Supabase account to review this request.</p>
            <form onSubmit={signIn}>
              <label>
                Email
                <input style={styles.input} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                Password
                <input style={styles.input} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <button style={styles.allow} type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in'}</button>
            </form>
          </>
        )}

        {details && (
          <>
            <p style={styles.text}>{clientName(details)} is asking to connect to your private Money Command Center assistant tools.</p>
            <div style={styles.panel}>
              <strong>What this connection can do</strong>
              <p style={styles.text}>Read the limited Money dashboard tools and prepare clearly labeled changes for your approval.</p>
              <p style={styles.text}>It cannot approve its own changes. Rent Tracker and Service Reports remain outside the assistant tools.</p>
              {details.scope && <p style={styles.text}><strong>Identity permissions:</strong> {details.scope}</p>}
            </div>
            <div style={styles.row}>
              <button style={styles.allow} type="button" disabled={working} onClick={() => decide(true)}>{working ? 'Connecting…' : 'Allow connection'}</button>
              <button style={styles.deny} type="button" disabled={working} onClick={() => decide(false)}>Do not allow</button>
            </div>
          </>
        )}

        {error && <p style={styles.error} role="alert">{error}</p>}
      </section>
    </main>
  )
}
