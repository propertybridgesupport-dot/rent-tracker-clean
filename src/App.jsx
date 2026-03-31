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

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')

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

  const [editingPropertyId, setEditingPropertyId] = useState(null)
  const [editPropertyForm, setEditPropertyForm] = useState({
    address: '',
    tenant: '',
    monthlyRent: '',
    dueDay: '1',
    lateFee: '0',
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

    if (companyError) setMessage(companyError.message)
    if (propertyError) setMessage(propertyError.message)

    const safeCompanies = companyData || []
    const safeProperties = propertyData || []

    setCompanies(safeCompanies)
    setProperties(safeProperties)

    if (safeCompanies.length > 0) {
      const stillExists = safeCompanies.find((c) => c.id === selectedCompanyId)
      if (!stillExists) setSelectedCompanyId(safeCompanies[0].id)
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

    if (error) setMessage(error.message)
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

  function startEditingProperty(property) {
    setEditingPropertyId(property.id)
    setEditPropertyForm({
      address: property.address || '',
      tenant: property.tenant || '',
      monthlyRent: String(property.monthly_rent || ''),
      dueDay: String(property.due_day || 1),
      lateFee: String(property.late_fee || 0),
    })
  }

  function cancelEditingProperty() {
    setEditingPropertyId(null)
    setEditPropertyForm({
      address: '',
      tenant: '',
      monthlyRent: '',
      dueDay: '1',
      lateFee: '0',
    })
  }

  async function saveEditedProperty(propertyId) {
    setMessage('')

    const { error } = await supabase
      .from('properties')
      .update({
        address: editPropertyForm.address,
        tenant: editPropertyForm.tenant,
        monthly_rent: Number(editPropertyForm.monthlyRent || 0),
        due_day: Number(editPropertyForm.dueDay || 1),
        late_fee: Number(editPropertyForm.lateFee || 0),
      })
      .eq('id', propertyId)

    if (error) {
      setMessage(error.message)
      return
    }

    cancelEditingProperty()
    await loadData()
  }

  async function deleteProperty(propertyId, address) {
    const confirmed = window.confirm(`Delete property: ${address}?`)
    if (!confirmed) return

    setMessage('')

    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (editingPropertyId === propertyId) {
      cancelEditingProperty()
    }

    await loadData()
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
          <h1 style={styles.authTitle}>Rent Tracker</h1>
          <p style={styles.authSubtitle}>Sign in to manage companies, properties, and monthly reporting.</p>

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
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Rent Tracker</h1>
          <p style={styles.subtitle}>Multi-owner dashboard for properties, tenants, and monthly reporting.</p>
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
        <div style={styles.sectionGrid}>
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
        <div style={styles.sectionGrid}>
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
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companyProperties.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan="6">No properties yet for this company.</td>
                    </tr>
                  ) : (
                    companyProperties.map((property) => (
                      <tr key={property.id}>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input
                              style={styles.tableInput}
                              value={editPropertyForm.address}
                              onChange={(e) => setEditPropertyForm({ ...editPropertyForm, address: e.target.value })}
                            />
                          ) : (
                            property.address
                          )}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input
                              style={styles.tableInput}
                              value={editPropertyForm.tenant}
                              onChange={(e) => setEditPropertyForm({ ...editPropertyForm, tenant: e.target.value })}
                            />
                          ) : (
                            property.tenant
                          )}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input
                              style={styles.tableInput}
                              type="number"
                              value={editPropertyForm.monthlyRent}
                              onChange={(e) => setEditPropertyForm({ ...editPropertyForm, monthlyRent: e.target.value })}
                            />
                          ) : (
                            currency(property.monthly_rent)
                          )}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input
                              style={styles.tableInput}
                              type="number"
                              value={editPropertyForm.dueDay}
                              onChange={(e) => setEditPropertyForm({ ...editPropertyForm, dueDay: e.target.value })}
                            />
                          ) : (
                            property.due_day
                          )}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input
                              style={styles.tableInput}
                              type="number"
                              value={editPropertyForm.lateFee}
                              onChange={(e) => setEditPropertyForm({ ...editPropertyForm, lateFee: e.target.value })}
                            />
                          ) : (
                            currency(property.late_fee)
                          )}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionRow}>
                            {editingPropertyId === property.id ? (
                              <>
                                <button
                                  style={styles.smallPrimaryButton}
                                  type="button"
                                  onClick={() => saveEditedProperty(property.id)}
                                >
                                  Save
                                </button>
                                <button
                                  style={styles.smallSecondaryButton}
                                  type="button"
                                  onClick={cancelEditingProperty}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  style={styles.smallSecondaryButton}
                                  type="button"
                                  onClick={() => startEditingProperty(property)}
                                >
                                  Edit
                                </button>
                                <button
                                  style={styles.smallDangerButton}
                                  type="button"
                                  onClick={() => deleteProperty(property.id, property.address)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
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
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Payments</h2>
          <p style={styles.smallMuted}>
            This is the next step. Once this dashboard is live, we’ll add payment entry, balances forward, and the monthly report.
          </p>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    color: '#0f172a',
  },
  authPage: {
    minHeight: '100vh',
    background: '#f8fafc',
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
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: '24px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
  },
  authTitle: {
    margin: '0 0 8px 0',
    fontSize: '34px',
  },
  authSubtitle: {
    margin: '0 0 20px 0',
    color: '#64748b',
    fontSize: '14px',
  },
  loadingCard: {
    maxWidth: '500px',
    margin: '40px auto',
    background: '#fff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '42px',
    lineHeight: 1.1,
  },
  subtitle: {
    margin: '8px 0 0 0',
    color: '#64748b',
    fontSize: '15px',
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
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '16px',
  },
  tabRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '18px',
  },
  tabButton: {
    background: '#e2e8f0',
    color: '#0f172a',
    border: 'none',
    borderRadius: '12px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  activeTabButton: {
    background: '#0f172a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
    marginBottom: '18px',
  },
  kpiCard: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
  },
  kpiLabel: {
    color: '#64748b',
    fontSize: '13px',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: 700,
  },
  kpiValueSmall: {
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1.3,
  },
  sectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
    gap: '16px',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
  },
  cardTitle: {
    marginTop: 0,
    marginBottom: '12px',
    fontSize: '22px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    marginTop: '12px',
    fontSize: '14px',
    fontWeight: 600,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 12px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    fontSize: '14px',
  },
  tableInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    fontSize: '14px',
  },
  primaryButton: {
    marginTop: '16px',
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '11px 16px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondaryButton: {
    background: '#e2e8f0',
    color: '#0f172a',
    border: 'none',
    borderRadius: '12px',
    padding: '11px 16px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  smallPrimaryButton: {
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
  },
  smallSecondaryButton: {
    background: '#e2e8f0',
    color: '#0f172a',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
  },
  smallDangerButton: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '14px',
  },
  actionRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
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
    borderBottom: '1px solid #e2e8f0',
    fontSize: '13px',
    color: '#475569',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px 8px',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  smallMuted: {
    color: '#64748b',
    fontSize: '14px',
  },
  message: {
    marginTop: '16px',
    color: '#b91c1c',
    fontSize: '14px',
  },
  messageBanner: {
    marginBottom: '18px',
    background: '#fff7ed',
    border: '1px solid #fdba74',
    color: '#9a3412',
    borderRadius: '12px',
    padding: '12px 14px',
    fontSize: '14px',
  },
}
