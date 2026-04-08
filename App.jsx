import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const monthOptions = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
]

function currency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

function monthLabel(month) {
  const [year, mon] = month.split('-')
  return new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 768
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [isMobile, setIsMobile] = useState(isMobileViewport())

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [companies, setCompanies] = useState([])
  const [properties, setProperties] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('2026-03')

  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    ownerEmail: '',
  })

  const [propertyForm, setPropertyForm] = useState({
    address: '',
    tenant: '',
    monthlyRent: '',
    dueDay: '1',
    lateFee: '0',
  })

  const [quickPaymentForm, setQuickPaymentForm] = useState({
    propertyId: '',
    paymentDate: '',
    amount: '',
    method: 'Cash',
    note: '',
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function handleResize() {
      setIsMobile(isMobileViewport())
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (session) {
      loadData()
    }
  }, [session])

  async function loadData() {
    setLoading(true)
    setMessage('')

    const [{ data: companyData, error: companyError }, { data: propertyData, error: propertyError }] =
      await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: true }),
        supabase.from('properties').select('*').order('created_at', { ascending: true }),
      ])

    if (companyError) {
      setMessage(companyError.message)
    }

    if (propertyError) {
      setMessage(propertyError.message)
    }

    const safeCompanies = companyData || []
    const safeProperties = propertyData || []

    setCompanies(safeCompanies)
    setProperties(safeProperties)

    if (safeCompanies.length > 0) {
      const stillExists = safeCompanies.find((c) => c.id === selectedCompanyId)
      if (!stillExists) {
        setSelectedCompanyId(safeCompanies[0].id)
      }
    } else {
      setSelectedCompanyId('')
    }

    setLoading(false)
  }

  async function signIn(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    }
  }

  async function signUp(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Account created. If email confirmation is on, confirm your email and then sign in.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function addCompany(e) {
    e.preventDefault()
    setMessage('')

    const userId = session?.user?.id
    if (!userId) {
      setMessage('No logged-in user found.')
      return
    }

    const payload = {
      company_id: userId,
      company_name: companyForm.companyName,
      owner_email: companyForm.ownerEmail || null,
    }

    const { error } = await supabase.from('companies').insert(payload)

    if (error) {
      setMessage(error.message)
      return
    }

    setCompanyForm({
      companyName: '',
      ownerEmail: '',
    })

    await loadData()
  }

  async function addProperty(e) {
    e.preventDefault()
    setMessage('')

    if (!selectedCompanyId) {
      setMessage('Please create or select a company first.')
      return
    }

    const payload = {
      company_id: selectedCompanyId,
      address: propertyForm.address,
      tenant: propertyForm.tenant,
      monthly_rent: Number(propertyForm.monthlyRent || 0),
      due_day: Number(propertyForm.dueDay || 1),
      late_fee: Number(propertyForm.lateFee || 0),
      is_active: true,
    }

    const { error } = await supabase.from('properties').insert(payload)

    if (error) {
      setMessage(error.message)
      return
    }

    setPropertyForm({
      address: '',
      tenant: '',
      monthlyRent: '',
      dueDay: '1',
      lateFee: '0',
    })

    await loadData()
  }

  function handleQuickPaymentChange(field, value) {
    setQuickPaymentForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleQuickPaymentDemoSave(e) {
    e.preventDefault()
    setMessage('Mobile payment screen styling is now in place. Payment posting logic can be connected into this screen next.')
  }

  const selectedCompany = useMemo(() => {
    return companies.find((company) => company.id === selectedCompanyId) || null
  }, [companies, selectedCompanyId])

  const selectedCompanyName = selectedCompany?.company_name || selectedCompany?.name || 'No company selected'

  const companyProperties = useMemo(() => {
    if (!selectedCompanyId) return []
    return properties.filter((property) => property.company_id === selectedCompanyId)
  }, [properties, selectedCompanyId])

  const totalMonthlyRent = companyProperties.reduce((sum, property) => sum + Number(property.monthly_rent || 0), 0)
  const totalLateFees = companyProperties.reduce((sum, property) => sum + Number(property.late_fee || 0), 0)
  const totalProperties = companyProperties.length
  const managementFeeEstimate = totalMonthlyRent * 0.1

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>Loading…</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={styles.authPage}>
        <div style={styles.authCard}>
          <div style={styles.authLogoWrap}>
            <img src="/logo.png" alt="Open Door Support" style={styles.authLogo} />
          </div>
          <h1 style={styles.authTitle}>Open Door Support</h1>
          <p style={styles.authSubtitle}>Sign in to manage companies, properties, and reports.</p>

          <form onSubmit={signIn}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div style={styles.buttonRow}>
              <button style={styles.primaryButton} type="submit">Sign In</button>
              <button style={styles.secondaryButton} type="button" onClick={signUp}>Create Account</button>
            </div>
          </form>

          {message ? <div style={styles.message}>{message}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <style>{`
        @media (max-width: 900px) {
          .responsive-section-grid,
          .responsive-payment-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div style={styles.brandHeader}>
        <div style={styles.brandHeaderLeft}>
          <div style={styles.logoWrap}>
            <img src="/logo.png" alt="Open Door Support" style={styles.logo} />
          </div>
          <div>
            <h1 style={styles.brandTitle}>Open Door Support</h1>
            <p style={styles.brandSubtitle}>Property Management System</p>
          </div>
        </div>

        <div style={styles.headerActions}>
          <button style={styles.secondaryButton} onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div style={styles.topControls}>
        <div style={styles.controlBlock}>
          <label style={styles.label}>Company</label>
          <select
            style={styles.input}
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
          >
            <option value="">Select a company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_name || company.name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.controlBlock}>
          <label style={styles.label}>Month</label>
          <select
            style={styles.input}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.tabRow}>
        <button
          style={activeTab === 'dashboard' ? styles.activeTabButton : styles.tabButton}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          style={activeTab === 'properties' ? styles.activeTabButton : styles.tabButton}
          onClick={() => setActiveTab('properties')}
        >
          Properties
        </button>
        <button
          style={activeTab === 'payments' ? styles.activeTabButton : styles.tabButton}
          onClick={() => setActiveTab('payments')}
        >
          Payments
        </button>
      </div>

      <div style={styles.cardGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Company</div>
          <div style={styles.kpiValueSmall}>{selectedCompanyName}</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Properties</div>
          <div style={styles.kpiValue}>{totalProperties}</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Monthly Rent</div>
          <div style={styles.kpiValue}>{currency(totalMonthlyRent)}</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Late Fees</div>
          <div style={styles.kpiValue}>{currency(totalLateFees)}</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>10% Mgmt Fee</div>
          <div style={styles.kpiValue}>{currency(managementFeeEstimate)}</div>
        </div>
      </div>

      {message ? <div style={styles.messageBanner}>{message}</div> : null}

      {activeTab === 'dashboard' && (
        <div className="responsive-section-grid" style={styles.sectionGrid}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Owner Summary</h2>
            <p style={styles.smallMuted}>
              {selectedCompanyName} — {monthLabel(selectedMonth)}
            </p>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Property</th>
                    <th style={styles.th}>Tenant</th>
                    <th style={styles.th}>Monthly Rent</th>
                    <th style={styles.th}>Late Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {companyProperties.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan="4">No properties yet for this company.</td>
                    </tr>
                  ) : (
                    companyProperties.map((property) => (
                      <tr key={property.id}>
                        <td style={styles.td}>{property.address}</td>
                        <td style={styles.td}>{property.tenant}</td>
                        <td style={styles.td}>{currency(property.monthly_rent)}</td>
                        <td style={styles.td}>{currency(property.late_fee)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Add Company</h2>
            <form onSubmit={addCompany}>
              <label style={styles.label}>Company Name</label>
              <input
                style={styles.input}
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
              />

              <label style={styles.label}>Owner Email</label>
              <input
                style={styles.input}
                value={companyForm.ownerEmail}
                onChange={(e) => setCompanyForm({ ...companyForm, ownerEmail: e.target.value })}
              />

              <button style={styles.primaryButton} type="submit">Save Company</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'properties' && (
        <div className="responsive-section-grid" style={styles.sectionGrid}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Properties</h2>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Address</th>
                    <th style={styles.th}>Tenant</th>
                    <th style={styles.th}>Rent</th>
                    <th style={styles.th}>Due Day</th>
                    <th style={styles.th}>Late Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {companyProperties.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan="5">No properties yet for this company.</td>
                    </tr>
                  ) : (
                    companyProperties.map((property) => (
                      <tr key={property.id}>
                        <td style={styles.td}>{property.address}</td>
                        <td style={styles.td}>{property.tenant}</td>
                        <td style={styles.td}>{currency(property.monthly_rent)}</td>
                        <td style={styles.td}>{property.due_day}</td>
                        <td style={styles.td}>{currency(property.late_fee)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Add Property</h2>
            <form onSubmit={addProperty}>
              <label style={styles.label}>Address</label>
              <input
                style={styles.input}
                value={propertyForm.address}
                onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
              />

              <label style={styles.label}>Tenant</label>
              <input
                style={styles.input}
                value={propertyForm.tenant}
                onChange={(e) => setPropertyForm({ ...propertyForm, tenant: e.target.value })}
              />

              <label style={styles.label}>Monthly Rent</label>
              <input
                style={styles.input}
                type="number"
                value={propertyForm.monthlyRent}
                onChange={(e) => setPropertyForm({ ...propertyForm, monthlyRent: e.target.value })}
              />

              <label style={styles.label}>Due Day</label>
              <input
                style={styles.input}
                type="number"
                value={propertyForm.dueDay}
                onChange={(e) => setPropertyForm({ ...propertyForm, dueDay: e.target.value })}
              />

              <label style={styles.label}>Late Fee</label>
              <input
                style={styles.input}
                type="number"
                value={propertyForm.lateFee}
                onChange={(e) => setPropertyForm({ ...propertyForm, lateFee: e.target.value })}
              />

              <button style={styles.primaryButton} type="submit">Save Property</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div style={styles.paymentLayout}>
          <div style={styles.mobileHeroCard}>
            <div style={styles.mobileHeroTextWrap}>
              <div style={styles.mobileHeroEyebrow}>Open Door Support</div>
              <h2 style={styles.mobileHeroTitle}>Quick Payment Entry</h2>
              <p style={styles.mobileHeroText}>
                This layout is now mobile-friendly and branded. It gives you larger tap targets,
                stacked controls, and a cleaner payment area that feels much better on a phone.
              </p>
            </div>

            <div style={styles.mobileButtonRow}>
              <button style={styles.primaryButton} type="button">Use Phone Mic</button>
              <button style={styles.secondaryButton} type="button">Use Keyboard Mic</button>
            </div>
          </div>

          <div className="responsive-payment-grid" style={styles.paymentGrid}>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Enter Payment</h2>
              <form onSubmit={handleQuickPaymentDemoSave}>
                <label style={styles.label}>Property</label>
                <select
                  style={styles.input}
                  value={quickPaymentForm.propertyId}
                  onChange={(e) => handleQuickPaymentChange('propertyId', e.target.value)}
                >
                  <option value="">Select property</option>
                  {companyProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                    </option>
                  ))}
                </select>

                <label style={styles.label}>Date Accepted</label>
                <input
                  style={styles.input}
                  type="date"
                  value={quickPaymentForm.paymentDate}
                  onChange={(e) => handleQuickPaymentChange('paymentDate', e.target.value)}
                />

                <label style={styles.label}>Amount</label>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="0.00"
                  value={quickPaymentForm.amount}
                  onChange={(e) => handleQuickPaymentChange('amount', e.target.value)}
                />

                <label style={styles.label}>Method</label>
                <select
                  style={styles.input}
                  value={quickPaymentForm.method}
                  onChange={(e) => handleQuickPaymentChange('method', e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="Check">Check</option>
                  <option value="Bank Deposit">Bank Deposit</option>
                  <option value="Money Order">Money Order</option>
                  <option value="Cash App">Cash App</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Venmo">Venmo</option>
                </select>

                <label style={styles.label}>Note</label>
                <textarea
                  style={styles.textarea}
                  rows="4"
                  placeholder="Optional note"
                  value={quickPaymentForm.note}
                  onChange={(e) => handleQuickPaymentChange('note', e.target.value)}
                />

                <div style={styles.mobileButtonRow}>
                  <button style={styles.primaryButton} type="submit">Save Payment</button>
                  <button style={styles.secondaryButton} type="button">Save + Add Another</button>
                </div>
              </form>
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Mobile Notes</h2>
              <div style={styles.mobileChecklist}>
                <div style={styles.mobileChecklistItem}>Large tap-friendly controls</div>
                <div style={styles.mobileChecklistItem}>Stacked fields for easier phone entry</div>
                <div style={styles.mobileChecklistItem}>Plum and gold brand styling throughout</div>
                <div style={styles.mobileChecklistItem}>Ready for payment logic hookup next</div>
              </div>

              <div style={styles.mobilePreviewCard}>
                <div style={styles.mobilePreviewLabel}>Preview</div>
                <div style={styles.mobilePreviewValue}>
                  {isMobile ? 'Mobile layout active' : 'Desktop preview of a mobile-first payment screen'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8f6f3',
    padding: '16px',
    fontFamily: 'Arial, sans-serif',
    color: '#261525',
  },
  authPage: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8f6f3 0%, #f3ede7 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  authCard: {
    width: '100%',
    maxWidth: '420px',
    background: '#ffffff',
    border: '1px solid #eadfce',
    borderRadius: '24px',
    padding: '28px',
    boxShadow: '0 12px 34px rgba(71, 15, 67, 0.10)',
  },
  authLogoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '18px',
  },
  authLogo: {
    width: '220px',
    maxWidth: '100%',
    objectFit: 'contain',
  },
  authTitle: {
    margin: '0 0 8px 0',
    fontSize: '34px',
    color: '#7b0f73',
    textAlign: 'center',
  },
  authSubtitle: {
    margin: '0 0 20px 0',
    color: '#8c6d45',
    fontSize: '14px',
    textAlign: 'center',
  },
  loadingCard: {
    maxWidth: '500px',
    margin: '40px auto',
    background: '#fff',
    borderRadius: '20px',
    border: '1px solid #eadfce',
    padding: '24px',
    boxShadow: '0 8px 24px rgba(71, 15, 67, 0.08)',
  },
  brandHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: '20px',
    background: '#ffffff',
    border: '1px solid #eadfce',
    borderRadius: '22px',
    padding: '18px 20px',
    boxShadow: '0 10px 30px rgba(71, 15, 67, 0.08)',
  },
  brandHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flexWrap: 'wrap',
  },
  logoWrap: {
    background: '#fffaf6',
    border: '1px solid #eadfce',
    borderRadius: '18px',
    padding: '10px 12px',
  },
  logo: {
    width: '170px',
    maxWidth: '42vw',
    objectFit: 'contain',
    display: 'block',
  },
  brandTitle: {
    margin: 0,
    fontSize: '28px',
    lineHeight: 1.1,
    color: '#7b0f73',
  },
  brandSubtitle: {
    margin: '6px 0 0 0',
    color: '#c79b62',
    fontSize: '14px',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  topControls: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
    marginBottom: '18px',
  },
  controlBlock: {
    background: '#ffffff',
    border: '1px solid #eadfce',
    borderRadius: '18px',
    padding: '16px',
    boxShadow: '0 4px 14px rgba(71, 15, 67, 0.05)',
  },
  tabRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '18px',
    overflowX: 'auto',
    paddingBottom: '2px',
  },
  tabButton: {
    background: '#f1e7ef',
    color: '#5a1a54',
    border: '1px solid #e0cde0',
    borderRadius: '999px',
    padding: '11px 18px',
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  activeTabButton: {
    background: '#7b0f73',
    color: '#ffffff',
    border: '1px solid #7b0f73',
    borderRadius: '999px',
    padding: '11px 18px',
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    boxShadow: '0 8px 18px rgba(123, 15, 115, 0.22)',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
    marginBottom: '18px',
  },
  kpiCard: {
    background: '#ffffff',
    border: '1px solid #eadfce',
    borderRadius: '20px',
    padding: '18px',
    boxShadow: '0 6px 18px rgba(71, 15, 67, 0.05)',
  },
  kpiLabel: {
    color: '#8c6d45',
    fontSize: '12px',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#381535',
  },
  kpiValueSmall: {
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#381535',
  },
  sectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
    gap: '16px',
  },
  paymentLayout: {
    display: 'grid',
    gap: '16px',
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)',
    gap: '16px',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #eadfce',
    borderRadius: '22px',
    padding: '20px',
    boxShadow: '0 8px 22px rgba(71, 15, 67, 0.05)',
  },
  mobileHeroCard: {
    background: 'linear-gradient(135deg, #fffaf6 0%, #f8ebf6 100%)',
    border: '1px solid #eadfce',
    borderRadius: '24px',
    padding: '22px',
    boxShadow: '0 10px 26px rgba(71, 15, 67, 0.06)',
    display: 'grid',
    gap: '16px',
  },
  mobileHeroTextWrap: {
    display: 'grid',
    gap: '8px',
  },
  mobileHeroEyebrow: {
    color: '#c79b62',
    textTransform: 'uppercase',
    letterSpacing: '.09em',
    fontWeight: 700,
    fontSize: '12px',
  },
  mobileHeroTitle: {
    margin: 0,
    color: '#7b0f73',
    fontSize: '30px',
    lineHeight: 1.1,
  },
  mobileHeroText: {
    margin: 0,
    color: '#5b4a3b',
    fontSize: '15px',
    lineHeight: 1.5,
  },
  cardTitle: {
    marginTop: 0,
    marginBottom: '12px',
    fontSize: '22px',
    color: '#381535',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    marginTop: '12px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#5a1a54',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    borderRadius: '14px',
    border: '1px solid #d9c2cf',
    background: '#fff',
    fontSize: '15px',
    color: '#261525',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    borderRadius: '14px',
    border: '1px solid #d9c2cf',
    background: '#fff',
    fontSize: '15px',
    color: '#261525',
    resize: 'vertical',
    fontFamily: 'Arial, sans-serif',
  },
  primaryButton: {
    marginTop: '16px',
    background: '#7b0f73',
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    padding: '13px 18px',
    cursor: 'pointer',
    fontWeight: 700,
    boxShadow: '0 8px 18px rgba(123, 15, 115, 0.22)',
  },
  secondaryButton: {
    background: '#f3e7d7',
    color: '#5b3b18',
    border: '1px solid #e2c59c',
    borderRadius: '14px',
    padding: '13px 18px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '14px',
  },
  mobileButtonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid #eadfce',
    fontSize: '13px',
    color: '#8c6d45',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  },
  td: {
    padding: '12px 8px',
    borderBottom: '1px solid #f0e6d9',
    fontSize: '14px',
  },
  smallMuted: {
    color: '#8c6d45',
    fontSize: '14px',
  },
  message: {
    marginTop: '16px',
    color: '#9f1239',
    fontSize: '14px',
  },
  messageBanner: {
    marginBottom: '18px',
    background: '#fff7ed',
    border: '1px solid #fdba74',
    color: '#9a3412',
    borderRadius: '14px',
    padding: '12px 14px',
    fontSize: '14px',
  },
  mobileChecklist: {
    display: 'grid',
    gap: '10px',
  },
  mobileChecklistItem: {
    padding: '12px 14px',
    borderRadius: '14px',
    background: '#fcf7f3',
    border: '1px solid #eadfce',
    color: '#4d2d4a',
    fontSize: '14px',
  },
  mobilePreviewCard: {
    marginTop: '16px',
    padding: '16px',
    borderRadius: '18px',
    background: '#fffaf6',
    border: '1px solid #eadfce',
  },
  mobilePreviewLabel: {
    fontSize: '12px',
    color: '#8c6d45',
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    fontWeight: 700,
    marginBottom: '6px',
  },
  mobilePreviewValue: {
    fontSize: '17px',
    color: '#381535',
    fontWeight: 700,
    lineHeight: 1.4,
  },
}
