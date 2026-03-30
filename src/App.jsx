import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [properties, setProperties] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
  }, [])

  async function signIn() {
    await supabase.auth.signInWithPassword({ email, password })
    location.reload()
  }

  async function signUp() {
    await supabase.auth.signUp({ email, password })
    alert('Account created')
  }

  async function signOut() {
    await supabase.auth.signOut()
    location.reload()
  }

  async function loadProperties() {
    const { data } = await supabase.from('properties').select('*')
    setProperties(data || [])
  }

  useEffect(() => {
    if (session) loadProperties()
  }, [session])

  if (!session) {
    return (
      <div>
        <h2>Login</h2>
        <input placeholder="email" onChange={(e)=>setEmail(e.target.value)} />
        <input placeholder="password" type="password" onChange={(e)=>setPassword(e.target.value)} />
        <br />
        <button onClick={signIn}>Sign In</button>
        <button onClick={signUp}>Create Account</button>
      </div>
    )
  }

  return (
    <div>
      <h1>Rent Tracker</h1>
      <button onClick={signOut}>Sign Out</button>

      <h3>Properties</h3>
      {properties.map(p => (
        <div key={p.id}>
          {p.address} — {p.tenant} — ${p.monthly_rent}
        </div>
      ))}
    </div>
  )
}