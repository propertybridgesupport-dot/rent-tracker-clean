import { useEffect, useMemo, useRef, useState } from 'react'
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

function getNextMonthKey(month) {
  const [year, mon] = month.split('-').map(Number)
  const nextDate = new Date(year, mon, 1)
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US')
}

function isWithinDateRange(dateValue, startDate, endDate) {
  if (!dateValue) return false
  const dateOnly = String(dateValue).slice(0, 10)
  if (startDate && dateOnly < startDate) return false
  if (endDate && dateOnly > endDate) return false
  return true
}
function monthKeyFromDate(dateValue) {
  if (!dateValue) return ''
  return String(dateValue).slice(0, 7)
}

function startOfMonth(month) {
  return `${month}-01`
}

function endOfMonth(month) {
  const [year, mon] = month.split('-').map(Number)
  return new Date(year, mon, 0).toISOString().slice(0, 10)
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizeTimelineDate(value, fallbackMonth) {
  if (value) return String(value).slice(0, 10)
  if (fallbackMonth) return `${fallbackMonth}-01`
  return ''
}

function getTenantForDate(property, propertyOverrides, dateValue) {
  const dateOnly = String(dateValue || '').slice(0, 10)
  if (!dateOnly) return ''

  const sortedOverrides = [...propertyOverrides].sort((a, b) => {
    const aDate = normalizeTimelineDate(a.move_in_date, a.month_key)
    const bDate = normalizeTimelineDate(b.move_in_date, b.month_key)
    return aDate.localeCompare(bDate)
  })

  let tenant = property.tenant || ''

  const moveInOverrides = sortedOverrides
    .filter((item) => item.move_in_date)
    .sort((a, b) => String(a.move_in_date).localeCompare(String(b.move_in_date)))

  if (moveInOverrides.length > 0 && dateOnly < String(moveInOverrides[0].move_in_date).slice(0, 10)) {
    tenant = ''
  }

  for (const override of sortedOverrides) {
    const effectiveDate = normalizeTimelineDate(override.move_in_date, override.month_key)
    if (!effectiveDate || effectiveDate > dateOnly) continue

    if (override.tenant_override) {
      tenant = override.tenant_override
    } else if (override.move_in_date) {
      tenant = property.tenant || tenant || ''
    }

    if (override.move_out_date) {
      const moveOutDate = String(override.move_out_date).slice(0, 10)
      if (dateOnly > moveOutDate) {
        tenant = ''
      }
    }
  }

  return tenant
}

function getOccupancyForMonth(property, propertyOverrides, month) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const tenantsSeen = new Map()
  let firstOccupiedDate = ''
  let lastOccupiedDate = ''

  for (let current = monthStart; current <= monthEnd; current = addDays(current, 1)) {
    const tenant = getTenantForDate(property, propertyOverrides, current)
    if (!tenant) continue

    tenantsSeen.set(tenant, (tenantsSeen.get(tenant) || 0) + 1)
    if (!firstOccupiedDate) firstOccupiedDate = current
    lastOccupiedDate = current
  }

  const sortedTenants = [...tenantsSeen.entries()].sort((a, b) => b[1] - a[1])
  const primaryTenant = sortedTenants[0]?.[0] || ''
  const occupiedDays = sortedTenants.reduce((sum, [, count]) => sum + count, 0)

  return {
    isOccupied: occupiedDays > 0,
    occupiedDays,
    primaryTenant,
    firstOccupiedDate,
    lastOccupiedDate,
    vacancy: occupiedDays === 0,
  }
}

function getTenantForMonth(property, propertyOverrides, month) {
  return getOccupancyForMonth(property, propertyOverrides, month).primaryTenant
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
  const [payments, setPayments] = useState([])
  const [monthlyOverrides, setMonthlyOverrides] = useState([])

  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('2026-03')
  const [selectedReportPropertyId, setSelectedReportPropertyId] = useState('')
  const [selectedTenantName, setSelectedTenantName] = useState('')
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')

  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    ownerEmail: '',
  })

  const [editingCompanyId, setEditingCompanyId] = useState(null)
  const [editCompanyForm, setEditCompanyForm] = useState({
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

  const [paymentForm, setPaymentForm] = useState({
    propertyId: '',
    paymentDate: '',
    amount: '',
    method: 'Cash',
    note: '',
  })

  const [editingPropertyId, setEditingPropertyId] = useState(null)
  const [editPropertyForm, setEditPropertyForm] = useState({
    address: '',
    tenant: '',
    monthlyRent: '',
    dueDay: '1',
    lateFee: '0',
  })

  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [editPaymentForm, setEditPaymentForm] = useState({
    paymentDate: '',
    amount: '',
    method: 'Cash',
    note: '',
  })

  const [editingOverrideId, setEditingOverrideId] = useState(null)
  const [overrideForm, setOverrideForm] = useState({
    tenantOverride: '',
    overrideRent: '',
    moveInDate: '',
    moveOutDate: '',
    startingBalance: '',
    notes: '',
  })

  const ownerReportRef = useRef(null)
  const propertyStatementRef = useRef(null)
  const tenantStatementRef = useRef(null)
  const propertyLedgerRef = useRef(null)

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
    if (session) loadData()
  }, [session])

  async function loadData() {
    setLoading(true)
    setMessage('')

    const [
      { data: companyData, error: companyError },
      { data: propertyData, error: propertyError },
      { data: paymentData, error: paymentError },
      { data: overrideData, error: overrideError },
    ] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: true }),
      supabase.from('properties').select('*').order('created_at', { ascending: true }),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('monthly_overrides').select('*').order('month_key', { ascending: true }),
    ])

    if (companyError) setMessage(companyError.message)
    if (propertyError) setMessage(propertyError.message)
    if (paymentError) setMessage(paymentError.message)
    if (overrideError) setMessage(overrideError.message)

    const safeCompanies = companyData || []
    const safeProperties = propertyData || []
    const safePayments = paymentData || []
    const safeOverrides = overrideData || []

    setCompanies(safeCompanies)
    setProperties(safeProperties)
    setPayments(safePayments)
    setMonthlyOverrides(safeOverrides)

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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
  }

  async function signUp(e) {
    e.preventDefault()
    setMessage('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else setMessage('Account created. If email confirmation is on, confirm your email and then sign in.')
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

    setCompanyForm({ companyName: '', ownerEmail: '' })
    await loadData()
  }

  function startEditingCompany(company) {
    setEditingCompanyId(company.id)
    setEditCompanyForm({
      companyName: company.company_name || company.name || '',
      ownerEmail: company.owner_email || '',
    })
  }

  function cancelEditingCompany() {
    setEditingCompanyId(null)
    setEditCompanyForm({
      companyName: '',
      ownerEmail: '',
    })
  }

  async function saveEditedCompany(companyId) {
    setMessage('')

    const { error } = await supabase
      .from('companies')
      .update({
        company_name: editCompanyForm.companyName,
        owner_email: editCompanyForm.ownerEmail || null,
      })
      .eq('id', companyId)

    if (error) {
      setMessage(error.message)
      return
    }

    cancelEditingCompany()
    await loadData()
  }

  async function deleteCompany(companyId, companyName) {
    const confirmed = window.confirm(`Delete company: ${companyName}?\n\nThis may also remove related properties and records.`)
    if (!confirmed) return

    setMessage('')

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (editingCompanyId === companyId) {
      cancelEditingCompany()
    }

    if (selectedCompanyId === companyId) {
      setSelectedCompanyId('')
    }

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

  async function addPayment(e) {
    e.preventDefault()
    setMessage('')

    if (!paymentForm.propertyId) {
      setMessage('Please select a property.')
      return
    }

    const payload = {
      property_id: paymentForm.propertyId,
      payment_date: paymentForm.paymentDate,
      amount: Number(paymentForm.amount || 0),
      method: paymentForm.method,
      note: paymentForm.note || null,
    }

    const { error } = await supabase.from('payments').insert(payload)

    if (error) {
      setMessage(error.message)
      return
    }

    setPaymentForm({
      propertyId: '',
      paymentDate: '',
      amount: '',
      method: 'Cash',
      note: '',
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

    const { error } = await supabase.from('properties').delete().eq('id', propertyId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (editingPropertyId === propertyId) cancelEditingProperty()
    await loadData()
  }

  function startEditingPayment(payment) {
    setEditingPaymentId(payment.id)
    setEditPaymentForm({
      paymentDate: payment.payment_date || '',
      amount: String(payment.amount || ''),
      method: payment.method || 'Cash',
      note: payment.note || '',
    })
  }

  function cancelEditingPayment() {
    setEditingPaymentId(null)
    setEditPaymentForm({
      paymentDate: '',
      amount: '',
      method: 'Cash',
      note: '',
    })
  }

  async function saveEditedPayment(paymentId) {
    setMessage('')

    const { error } = await supabase
      .from('payments')
      .update({
        payment_date: editPaymentForm.paymentDate,
        amount: Number(editPaymentForm.amount || 0),
        method: editPaymentForm.method,
        note: editPaymentForm.note || null,
      })
      .eq('id', paymentId)

    if (error) {
      setMessage(error.message)
      return
    }

    cancelEditingPayment()
    await loadData()
  }

  async function deletePayment(paymentId) {
    const confirmed = window.confirm('Delete this payment?')
    if (!confirmed) return

    setMessage('')

    const { error } = await supabase.from('payments').delete().eq('id', paymentId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (editingPaymentId === paymentId) cancelEditingPayment()
    await loadData()
  }

  function startEditingOverride(propertyId, current) {
    setEditingOverrideId(propertyId)
    setOverrideForm({
      tenantOverride: current?.tenant_override || '',
      overrideRent: current?.override_rent ?? '',
      moveInDate: current?.move_in_date || '',
      moveOutDate: current?.move_out_date || '',
      startingBalance: current?.starting_balance ?? '',
      notes: current?.notes || '',
    })
  }

  function cancelEditingOverride() {
    setEditingOverrideId(null)
    setOverrideForm({
      tenantOverride: '',
      overrideRent: '',
      moveInDate: '',
      moveOutDate: '',
      startingBalance: '',
      notes: '',
    })
  }

  async function saveOverride(propertyId) {
    setMessage('')

    const existing = monthlyOverrides.find(
      (item) => item.property_id === propertyId && item.month_key === selectedMonth
    )

    const payload = {
      property_id: propertyId,
      month_key: selectedMonth,
      override_rent: overrideForm.overrideRent === '' ? null : Number(overrideForm.overrideRent),
      tenant_override: overrideForm.tenantOverride || null,
      move_in_date: overrideForm.moveInDate || null,
      move_out_date: overrideForm.moveOutDate || null,
      starting_balance: overrideForm.startingBalance === '' ? 0 : Number(overrideForm.startingBalance || 0),
      notes: overrideForm.notes || null,
    }

    let error

    if (existing) {
      ;({ error } = await supabase.from('monthly_overrides').update(payload).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('monthly_overrides').insert(payload))
    }

    if (error) {
      setMessage(error.message)
      return
    }

    cancelEditingOverride()
    await loadData()
  }

  async function rollMonthForward() {
    setMessage('')

    if (!selectedCompanyId) {
      setMessage('Please select a company first.')
      return
    }

    const nextMonthStart = startOfMonth(nextMonthKey)
    const existingNextMonthOverrides = companyOverrides.filter((item) => item.month_key === nextMonthKey)
    const existingPropertyIds = new Set(existingNextMonthOverrides.map((item) => item.property_id))

    const rowsToInsert = companyProperties
      .map((property) => {
        if (existingPropertyIds.has(property.id)) return null

        const propertyOverrides = companyOverrides.filter((item) => item.property_id === property.id)
        const nextTenant = getTenantForDate(property, propertyOverrides, nextMonthStart)
        if (!nextTenant) return null

        const monthSummary = propertyLedgerMap[property.id]?.monthlySummaries?.find((item) => item.month === selectedMonth)
        const endingBalance = Number(monthSummary?.endingBalance || 0)

        return {
          property_id: property.id,
          month_key: nextMonthKey,
          override_rent: null,
          tenant_override: nextTenant,
          move_in_date: null,
          move_out_date: null,
          starting_balance: endingBalance,
          notes: `Rolled forward from ${monthLabel(selectedMonth)}`,
        }
      })
      .filter(Boolean)

    const skippedCount = companyProperties.length - rowsToInsert.length

    if (rowsToInsert.length === 0) {
      setMessage(`Nothing to roll forward. ${monthLabel(nextMonthKey)} already has overrides or no active tenants were found.`)
      return
    }

    const confirmed = window.confirm(
      `Roll ${rowsToInsert.length} active propert${rowsToInsert.length === 1 ? 'y' : 'ies'} from ${monthLabel(selectedMonth)} into ${monthLabel(nextMonthKey)}?

` +
      `This will create next-month override rows with the active tenant and carried balance. Existing ${monthLabel(nextMonthKey)} overrides will be left alone.`
    )

    if (!confirmed) return

    const { error } = await supabase.from('monthly_overrides').insert(rowsToInsert)

    if (error) {
      setMessage(error.message)
      return
    }

    setSelectedMonth(nextMonthKey)
    await loadData()
    setMessage(
      `Rolled ${rowsToInsert.length} active propert${rowsToInsert.length === 1 ? 'y' : 'ies'} into ${monthLabel(nextMonthKey)}.` +
      (skippedCount > 0 ? ` ${skippedCount} ${skippedCount === 1 ? 'property was' : 'properties were'} skipped because they were vacant or already had a setup.` : '')
    )
  }

  const selectedCompany = useMemo(() => {
    return companies.find((company) => company.id === selectedCompanyId) || null
  }, [companies, selectedCompanyId])

  const selectedCompanyName = selectedCompany?.company_name || selectedCompany?.name || 'No company selected'
  const selectedCompanyEmail = selectedCompany?.owner_email || ''
  const nextMonthKey = useMemo(() => getNextMonthKey(selectedMonth), [selectedMonth])

  const companyProperties = useMemo(() => {
    if (!selectedCompanyId) return []
    return properties.filter((property) => property.company_id === selectedCompanyId)
  }, [properties, selectedCompanyId])

  useEffect(() => {
    if (companyProperties.length > 0) {
      const exists = companyProperties.find((p) => p.id === selectedReportPropertyId)
      if (!exists) setSelectedReportPropertyId(companyProperties[0].id)
    } else {
      setSelectedReportPropertyId('')
    }
  }, [companyProperties, selectedReportPropertyId])

  const companyPropertyIds = useMemo(() => companyProperties.map((property) => property.id), [companyProperties])

  const companyPayments = useMemo(() => {
    return payments.filter((payment) => companyPropertyIds.includes(payment.property_id))
  }, [payments, companyPropertyIds])

  const companyOverrides = useMemo(() => {
    return monthlyOverrides.filter((override) => companyPropertyIds.includes(override.property_id))
  }, [monthlyOverrides, companyPropertyIds])

  const monthlyPayments = useMemo(() => {
    return companyPayments.filter((payment) => String(payment.payment_date).startsWith(selectedMonth))
  }, [companyPayments, selectedMonth])

  function buildPropertyLedger(property, monthsToInclude) {
    const propertyOverrides = companyOverrides.filter((item) => item.property_id === property.id)
    const propertyPayments = companyPayments
      .filter((payment) => payment.property_id === property.id)
      .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)))

    let runningBalance = 0
    const entries = []
    const monthlySummaries = []

    monthsToInclude.forEach((month) => {
      const override = propertyOverrides.find(
        (item) => item.property_id === property.id && item.month_key === month
      )
      const occupancy = getOccupancyForMonth(property, propertyOverrides, month)
      const effectiveTenant = occupancy.primaryTenant || ''
      const effectiveRent =
        override?.override_rent !== null && override?.override_rent !== undefined
          ? Number(override.override_rent)
          : Number(property.monthly_rent || 0)
      const lateFee = occupancy.isOccupied ? Number(property.late_fee || 0) : 0
      const startingBalance = Number(override?.starting_balance || 0)
      const monthPaymentsForProperty = propertyPayments.filter(
        (payment) => String(payment.payment_date).startsWith(month)
      )
      const monthStart = startOfMonth(month)
      const balanceForward = runningBalance

      if (balanceForward !== 0) {
        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: effectiveTenant,
          month,
          date: monthStart,
          type: 'balance_forward',
          description: 'Balance forward',
          amount: balanceForward,
          note: '',
          runningBalance,
        })
      }

      if (startingBalance !== 0) {
        runningBalance += startingBalance
        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: effectiveTenant,
          month,
          date: monthStart,
          type: 'adjustment',
          description: 'Starting balance / adjustment',
          amount: startingBalance,
          note: override?.notes || '',
          runningBalance,
        })
      }

      if (occupancy.isOccupied && effectiveRent !== 0) {
        runningBalance += effectiveRent
        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: effectiveTenant,
          month,
          date: occupancy.firstOccupiedDate || monthStart,
          type: 'charge',
          description: occupancy.occupiedDays < 28 ? 'Rent charge (partial occupancy month)' : 'Rent charge',
          amount: effectiveRent,
          note: override?.notes || '',
          occupancyStart: occupancy.firstOccupiedDate,
          occupancyEnd: occupancy.lastOccupiedDate,
          runningBalance,
        })
      }

      if (occupancy.isOccupied && lateFee !== 0) {
        runningBalance += lateFee
        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: effectiveTenant,
          month,
          date: occupancy.firstOccupiedDate || monthStart,
          type: 'late_fee',
          description: 'Late fee',
          amount: lateFee,
          note: '',
          runningBalance,
        })
      }

      monthPaymentsForProperty.forEach((payment) => {
        runningBalance -= Number(payment.amount || 0)
        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: getTenantForDate(property, propertyOverrides, payment.payment_date) || effectiveTenant,
          month,
          date: payment.payment_date,
          type: 'payment',
          description: `Payment - ${payment.method || 'Method not listed'}`,
          amount: -Number(payment.amount || 0),
          note: payment.note || '',
          paymentId: payment.id,
          runningBalance,
        })
      })

      monthlySummaries.push({
        month,
        effectiveTenant,
        effectiveRent: occupancy.isOccupied ? effectiveRent : 0,
        occupancy,
        balanceForward,
        startingBalance,
        lateFee,
        totalPaid: monthPaymentsForProperty.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        endingBalance: runningBalance,
        notes: override?.notes || '',
        currentOverride: override || null,
        moveInDate: override?.move_in_date || occupancy.firstOccupiedDate || '',
        moveOutDate: override?.move_out_date || '',
      })
    })

    return {
      propertyId: property.id,
      entries,
      monthlySummaries,
    }
  }

  const propertyLedgers = useMemo(() => {
    return companyProperties.map((property) => ({
      property,
      ...buildPropertyLedger(property, monthOptions),
    }))
  }, [companyProperties, companyOverrides, companyPayments])

  const propertyLedgerMap = useMemo(() => {
    return Object.fromEntries(propertyLedgers.map((item) => [item.propertyId, item]))
  }, [propertyLedgers])

  const ledgerRows = useMemo(() => {
    return companyProperties.map((property) => {
      const ledger = propertyLedgerMap[property.id]
      const monthSummary = ledger?.monthlySummaries.find((item) => item.month === selectedMonth)

      if (!monthSummary) {
        return {
          ...property,
          effectiveTenant: '',
          effectiveRent: 0,
          balanceForward: 0,
          startingBalance: 0,
          moveInDate: '',
          moveOutDate: '',
          notes: '',
          totalDue: 0,
          totalPaid: 0,
          balanceRemaining: 0,
          managementFee: 0,
          currentOverride: null,
          isVacant: true,
        }
      }

      const totalDue =
        Number(monthSummary.balanceForward || 0) +
        Number(monthSummary.startingBalance || 0) +
        Number(monthSummary.effectiveRent || 0) +
        Number(monthSummary.lateFee || 0)

      return {
        ...property,
        effectiveTenant: monthSummary.effectiveTenant,
        effectiveRent: monthSummary.effectiveRent,
        balanceForward: monthSummary.balanceForward,
        startingBalance: monthSummary.startingBalance,
        moveInDate: monthSummary.moveInDate,
        moveOutDate: monthSummary.moveOutDate,
        notes: monthSummary.notes,
        totalDue,
        totalPaid: monthSummary.totalPaid,
        balanceRemaining: monthSummary.endingBalance,
        managementFee: monthSummary.totalPaid * 0.1,
        currentOverride: monthSummary.currentOverride,
        isVacant: monthSummary.occupancy?.vacancy ?? true,
      }
    })
  }, [companyProperties, propertyLedgerMap, selectedMonth])

  const selectedReportProperty = companyProperties.find((p) => p.id === selectedReportPropertyId) || null

  const selectedPropertyLedger = useMemo(() => {
    if (!selectedReportPropertyId) return null
    return propertyLedgerMap[selectedReportPropertyId] || null
  }, [selectedReportPropertyId, propertyLedgerMap])

  const selectedPropertyLedgerRows = useMemo(() => {
    if (!selectedPropertyLedger) return []

    return selectedPropertyLedger.entries.filter((entry) => {
      if (!reportStartDate && !reportEndDate) return true
      if (entry.type === 'balance_forward') return true
      return isWithinDateRange(entry.date, reportStartDate, reportEndDate)
    })
  }, [selectedPropertyLedger, reportStartDate, reportEndDate])

  const selectedPropertyLedgerTotals = useMemo(() => {
    return selectedPropertyLedgerRows.reduce(
      (totals, row) => {
        if (row.type === 'payment') {
          totals.credits += Math.abs(Number(row.amount || 0))
        } else {
          totals.charges += Number(row.amount || 0)
        }

        if (row.type === 'late_fee') totals.lateFees += Number(row.amount || 0)
        if (row.type === 'charge') totals.rentCharges += Number(row.amount || 0)
        if (row.type === 'adjustment') totals.adjustments += Number(row.amount || 0)
        totals.endingBalance = Number(row.runningBalance || 0)
        return totals
      },
      {
        charges: 0,
        credits: 0,
        lateFees: 0,
        rentCharges: 0,
        adjustments: 0,
        endingBalance: 0,
      }
    )
  }, [selectedPropertyLedgerRows])
  const companyTenantNames = useMemo(() => {
    const names = new Set()

    propertyLedgers.forEach((ledger) => {
      ledger.entries.forEach((entry) => {
        if (entry.tenantName) names.add(entry.tenantName)
      })
      ledger.monthlySummaries.forEach((summary) => {
        if (summary.effectiveTenant) names.add(summary.effectiveTenant)
      })
    })

    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [propertyLedgers])

  useEffect(() => {
    if (companyTenantNames.length > 0) {
      if (!selectedTenantName || !companyTenantNames.includes(selectedTenantName)) {
        setSelectedTenantName(companyTenantNames[0])
      }
    } else {
      setSelectedTenantName('')
    }
  }, [companyTenantNames, selectedTenantName])

  const selectedPropertyStatementRows = useMemo(() => {
    if (!selectedReportProperty) return []

    const ledger = propertyLedgerMap[selectedReportProperty.id]
    if (!ledger) return []

    return ledger.entries.filter((entry) => {
      if (entry.type === 'balance_forward') return true
      return isWithinDateRange(entry.date, reportStartDate, reportEndDate)
    })
  }, [selectedReportProperty, propertyLedgerMap, reportStartDate, reportEndDate])

  const selectedTenantStatementRows = useMemo(() => {
    if (!selectedTenantName) return []

    const rows = propertyLedgers
      .flatMap((ledger) => ledger.entries)
      .filter((entry) => entry.tenantName === selectedTenantName)
      .filter((entry) => {
        if (entry.type === 'balance_forward') return true
        return isWithinDateRange(entry.date, reportStartDate, reportEndDate)
      })
      .sort((a, b) => {
        const dateCompare = String(a.date).localeCompare(String(b.date))
        if (dateCompare !== 0) return dateCompare
        return String(a.propertyAddress || '').localeCompare(String(b.propertyAddress || ''))
      })

    let runningBalance = 0

    return rows.map((row) => {
      if (row.type === 'balance_forward') {
        runningBalance = Number(row.amount || 0)
        return {
          ...row,
          runningBalance,
        }
      }

      runningBalance += Number(row.amount || 0)
      return {
        ...row,
        runningBalance,
      }
    })
  }, [selectedTenantName, propertyLedgers, reportStartDate, reportEndDate])

  const totalProperties = companyProperties.length
  const totalMonthlyRent = ledgerRows.reduce((sum, row) => sum + Number(row.effectiveRent || 0), 0)
  const totalCollected = ledgerRows.reduce((sum, row) => sum + Number(row.totalPaid || 0), 0)
  const totalOutstanding = ledgerRows.reduce((sum, row) => sum + Number(row.balanceRemaining || 0), 0)
  const managementFeeCollected = totalCollected * 0.1

  function printOwnerReport() {
    window.print()
  }

  function emailOwnerReport() {
    if (!selectedCompanyEmail) {
      setMessage('This company does not have an owner email saved yet.')
      return
    }

    const subject = `${selectedCompanyName} - Owner Report - ${monthLabel(selectedMonth)}`
    const lines = [
      `Company: ${selectedCompanyName}`,
      `Month: ${monthLabel(selectedMonth)}`,
      '',
      `Properties: ${totalProperties}`,
      `Monthly Rent: ${currency(totalMonthlyRent)}`,
      `Collected: ${currency(totalCollected)}`,
      `Outstanding: ${currency(totalOutstanding)}`,
      `10% Management Fee: ${currency(managementFeeCollected)}`,
      '',
      'Owner Summary:',
      ...ledgerRows.map((row) =>
        `${row.address} | ${row.effectiveTenant} | Rent: ${currency(row.effectiveRent)} | Collected: ${currency(row.totalPaid)} | Balance: ${currency(row.balanceRemaining)}`
      ),
      '',
      'Notes:',
      'Balances reflect prior unpaid amounts carried forward. Prorated rents and tenant changes are applied where applicable. Management fee is calculated at 10% of collected rent.',
    ]

    window.location.href = `mailto:${selectedCompanyEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
  }


  function formatLedgerEntryType(type) {
    const labels = {
      charge: 'Charge',
      payment: 'Payment',
      late_fee: 'Late Fee',
      balance_forward: 'Balance Forward',
      adjustment: 'Adjustment',
    }

    return labels[type] || type
  }

  function formatLedgerAmount(row) {
    if (row.type === 'payment') {
      return `(${currency(Math.abs(row.amount))})`
    }

    return currency(row.amount)
  }

  function escapeCsv(value) {
    const safeValue = value ?? ''
    const text = String(safeValue)
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  function printSection(sectionRef, title) {
    const sectionHtml = sectionRef?.current?.innerHTML

    if (!sectionHtml) {
      setMessage(`Nothing to print for ${title}.`)
      return
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=800')
    if (!printWindow) {
      setMessage('Your browser blocked the print window. Please allow pop-ups and try again.')
      return
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 16px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${sectionHtml}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }


  function exportPropertyLedgerCsv() {
    if (!selectedReportProperty) {
      setMessage('Please select a property first.')
      return
    }

    const rows = [
      ['Date', 'Month', 'Property', 'Tenant', 'Type', 'Description', 'Charge', 'Credit', 'Running Balance', 'Note'],
      ...selectedPropertyLedgerRows.map((row) => [
        formatDate(row.date),
        row.month ? monthLabel(row.month) : '',
        row.propertyAddress || selectedReportProperty.address,
        row.tenantName || '',
        formatLedgerEntryType(row.type),
        row.description,
        row.type === 'payment' ? '' : Number(row.amount || 0).toFixed(2),
        row.type === 'payment' ? Math.abs(Number(row.amount || 0)).toFixed(2) : '',
        Number(row.runningBalance || 0).toFixed(2),
        row.note || '',
      ]),
    ]

    downloadCsv(`${(selectedReportProperty.address || 'property_ledger').replace(/[^a-z0-9]+/gi, '_')}_ledger.csv`, rows)
  }

  function exportPropertyStatementCsv() {
    if (!selectedReportProperty) {
      setMessage('Please select a property first.')
      return
    }

    const rows = [
      ['Date', 'Type', 'Description', 'Amount', 'Running Balance', 'Note'],
      ...selectedPropertyStatementRows.map((row) => [
        formatDate(row.date),
        formatLedgerEntryType(row.type),
        row.description,
        row.type === 'payment' ? `-${Math.abs(Number(row.amount || 0)).toFixed(2)}` : Number(row.amount || 0).toFixed(2),
        Number(row.runningBalance || 0).toFixed(2),
        row.note || '',
      ]),
    ]

    downloadCsv(`${(selectedReportProperty.address || 'property_statement').replace(/[^a-z0-9]+/gi, '_')}_${selectedMonth}.csv`, rows)
  }

  function exportTenantStatementCsv() {
    if (!selectedTenantName) {
      setMessage('Please select a tenant first.')
      return
    }

    const rows = [
      ['Date', 'Property', 'Type', 'Description', 'Amount', 'Running Balance', 'Note'],
      ...selectedTenantStatementRows.map((row) => [
        formatDate(row.date),
        row.propertyAddress,
        formatLedgerEntryType(row.type),
        row.description,
        row.type === 'payment' ? `-${Math.abs(Number(row.amount || 0)).toFixed(2)}` : Number(row.amount || 0).toFixed(2),
        Number(row.runningBalance || 0).toFixed(2),
        row.note || '',
      ]),
    ]

    downloadCsv(`${selectedTenantName.replace(/[^a-z0-9]+/gi, '_')}_${selectedMonth}.csv`, rows)
  }

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
          <p style={styles.authSubtitle}>Sign in to manage companies, properties, payments, and reports.</p>

          <form onSubmit={signIn}>
            <label style={styles.label}>Email</label>
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
          <p style={styles.subtitle}>Multi-owner dashboard for properties, tenants, payments, and monthly reporting.</p>
        </div>

        <div style={styles.headerActions}>
          <button style={styles.secondaryButton} onClick={printOwnerReport}>Print Report</button>
          <button style={styles.secondaryButton} onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div style={styles.topControls}>
        <div style={styles.controlBlock}>
          <label style={styles.label}>Company</label>
          <select style={styles.input} value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
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
          <select style={styles.input} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{monthLabel(month)}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.tabRow}>
        <button style={activeTab === 'dashboard' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button style={activeTab === 'companies' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('companies')}>Companies</button>
        <button style={activeTab === 'properties' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('properties')}>Properties</button>
        <button style={activeTab === 'payments' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('payments')}>Payments</button>
        <button style={activeTab === 'overrides' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('overrides')}>Overrides</button>
        <button style={activeTab === 'ledger' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('ledger')}>Ledger</button>
        <button style={activeTab === 'reports' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('reports')}>Reports</button>
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
          <div style={styles.kpiLabel}>Collected</div>
          <div style={styles.kpiValue}>{currency(totalCollected)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Outstanding</div>
          <div style={styles.kpiValue}>{currency(totalOutstanding)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>10% Mgmt Fee</div>
          <div style={styles.kpiValue}>{currency(managementFeeCollected)}</div>
        </div>
      </div>

      {message ? <div style={styles.messageBanner}>{message}</div> : null}

      {activeTab === 'dashboard' && (
        <div style={styles.sectionGridSingle}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Owner Summary</h2>
            <p style={styles.smallMuted}>{selectedCompanyName} — {monthLabel(selectedMonth)}</p>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Property</th>
                    <th style={styles.th}>Tenant</th>
                    <th style={styles.th}>Rent</th>
                    <th style={styles.th}>Collected</th>
                    <th style={styles.th}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.length === 0 ? (
                    <tr><td style={styles.td} colSpan="5">No properties yet for this company.</td></tr>
                  ) : (
                    ledgerRows.map((row) => (
                      <tr key={row.id}>
                        <td style={styles.td}>{row.address}</td>
                        <td style={styles.td}>{row.effectiveTenant}</td>
                        <td style={styles.td}>{currency(row.effectiveRent)}</td>
                        <td style={styles.td}>{currency(row.totalPaid)}</td>
                        <td style={styles.td}>{currency(row.balanceRemaining)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={styles.notesBox}>
              <strong>Notes:</strong> Balances reflect prior unpaid amounts carried forward. Prorated rents and tenant changes are applied where applicable. Management fee is calculated at 10% of collected rent.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div style={styles.sectionGrid}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Companies</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Company Name</th>
                    <th style={styles.th}>Owner Email</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 ? (
                    <tr><td style={styles.td} colSpan="3">No companies yet.</td></tr>
                  ) : (
                    companies.map((company) => (
                      <tr key={company.id}>
                        <td style={styles.td}>
                          {editingCompanyId === company.id ? (
                            <input
                              style={styles.tableInput}
                              value={editCompanyForm.companyName}
                              onChange={(e) => setEditCompanyForm({ ...editCompanyForm, companyName: e.target.value })}
                            />
                          ) : (
                            company.company_name || company.name
                          )}
                        </td>
                        <td style={styles.td}>
                          {editingCompanyId === company.id ? (
                            <input
                              style={styles.tableInput}
                              value={editCompanyForm.ownerEmail}
                              onChange={(e) => setEditCompanyForm({ ...editCompanyForm, ownerEmail: e.target.value })}
                            />
                          ) : (
                            company.owner_email || '—'
                          )}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionRow}>
                            {editingCompanyId === company.id ? (
                              <>
                                <button
                                  style={styles.smallPrimaryButton}
                                  type="button"
                                  onClick={() => saveEditedCompany(company.id)}
                                >
                                  Save
                                </button>
                                <button
                                  style={styles.smallSecondaryButton}
                                  type="button"
                                  onClick={cancelEditingCompany}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  style={styles.smallSecondaryButton}
                                  type="button"
                                  onClick={() => startEditingCompany(company)}
                                >
                                  Edit
                                </button>
                                <button
                                  style={styles.smallDangerButton}
                                  type="button"
                                  onClick={() => deleteCompany(company.id, company.company_name || company.name || 'this company')}
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
                    <tr><td style={styles.td} colSpan="6">No properties yet for this company.</td></tr>
                  ) : (
                    companyProperties.map((property) => (
                      <tr key={property.id}>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input style={styles.tableInput} value={editPropertyForm.address} onChange={(e) => setEditPropertyForm({ ...editPropertyForm, address: e.target.value })} />
                          ) : property.address}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input style={styles.tableInput} value={editPropertyForm.tenant} onChange={(e) => setEditPropertyForm({ ...editPropertyForm, tenant: e.target.value })} />
                          ) : property.tenant}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input style={styles.tableInput} type="number" value={editPropertyForm.monthlyRent} onChange={(e) => setEditPropertyForm({ ...editPropertyForm, monthlyRent: e.target.value })} />
                          ) : currency(property.monthly_rent)}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input style={styles.tableInput} type="number" value={editPropertyForm.dueDay} onChange={(e) => setEditPropertyForm({ ...editPropertyForm, dueDay: e.target.value })} />
                          ) : property.due_day}
                        </td>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input style={styles.tableInput} type="number" value={editPropertyForm.lateFee} onChange={(e) => setEditPropertyForm({ ...editPropertyForm, lateFee: e.target.value })} />
                          ) : currency(property.late_fee)}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionRow}>
                            {editingPropertyId === property.id ? (
                              <>
                                <button style={styles.smallPrimaryButton} type="button" onClick={() => saveEditedProperty(property.id)}>Save</button>
                                <button style={styles.smallSecondaryButton} type="button" onClick={cancelEditingProperty}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button style={styles.smallSecondaryButton} type="button" onClick={() => startEditingProperty(property)}>Edit</button>
                                <button style={styles.smallDangerButton} type="button" onClick={() => deleteProperty(property.id, property.address)}>Delete</button>
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
              <input style={styles.input} value={propertyForm.address} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} />
              <label style={styles.label}>Tenant</label>
              <input style={styles.input} value={propertyForm.tenant} onChange={(e) => setPropertyForm({ ...propertyForm, tenant: e.target.value })} />
              <label style={styles.label}>Monthly Rent</label>
              <input style={styles.input} type="number" value={propertyForm.monthlyRent} onChange={(e) => setPropertyForm({ ...propertyForm, monthlyRent: e.target.value })} />
              <label style={styles.label}>Due Day</label>
              <input style={styles.input} type="number" value={propertyForm.dueDay} onChange={(e) => setPropertyForm({ ...propertyForm, dueDay: e.target.value })} />
              <label style={styles.label}>Late Fee</label>
              <input style={styles.input} type="number" value={propertyForm.lateFee} onChange={(e) => setPropertyForm({ ...propertyForm, lateFee: e.target.value })} />
              <button style={styles.primaryButton} type="submit">Save Property</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div style={styles.sectionGrid}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Payments This Month</h2>
            <p style={styles.smallMuted}>{selectedCompanyName} — {monthLabel(selectedMonth)}</p>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Property</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Method</th>
                    <th style={styles.th}>Note</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyPayments.length === 0 ? (
                    <tr><td style={styles.td} colSpan="6">No payments entered for this month.</td></tr>
                  ) : (
                    monthlyPayments.map((payment) => {
                      const property = companyProperties.find((p) => p.id === payment.property_id)
                      return (
                        <tr key={payment.id}>
                          <td style={styles.td}>
                            {editingPaymentId === payment.id ? (
                              <input style={styles.tableInput} type="date" value={editPaymentForm.paymentDate} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, paymentDate: e.target.value })} />
                            ) : payment.payment_date}
                          </td>
                          <td style={styles.td}>{property?.address || '—'}</td>
                          <td style={styles.td}>
                            {editingPaymentId === payment.id ? (
                              <input style={styles.tableInput} type="number" value={editPaymentForm.amount} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, amount: e.target.value })} />
                            ) : currency(payment.amount)}
                          </td>
                          <td style={styles.td}>
                            {editingPaymentId === payment.id ? (
                              <select style={styles.tableInput} value={editPaymentForm.method} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, method: e.target.value })}>
                                <option value="Cash">Cash</option>
                                <option value="Bank Deposit">Bank Deposit</option>
                                <option value="Check">Check</option>
                                <option value="Money Order">Money Order</option>
                                <option value="Cash App">Cash App</option>
                                <option value="Zelle">Zelle</option>
                                <option value="Venmo">Venmo</option>
                              </select>
                            ) : (payment.method || '—')}
                          </td>
                          <td style={styles.td}>
                            {editingPaymentId === payment.id ? (
                              <input style={styles.tableInput} value={editPaymentForm.note} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, note: e.target.value })} />
                            ) : (payment.note || '—')}
                          </td>
                          <td style={styles.td}>
                            <div style={styles.actionRow}>
                              {editingPaymentId === payment.id ? (
                                <>
                                  <button style={styles.smallPrimaryButton} type="button" onClick={() => saveEditedPayment(payment.id)}>Save</button>
                                  <button style={styles.smallSecondaryButton} type="button" onClick={cancelEditingPayment}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button style={styles.smallSecondaryButton} type="button" onClick={() => startEditingPayment(payment)}>Edit</button>
                                  <button style={styles.smallDangerButton} type="button" onClick={() => deletePayment(payment.id)}>Delete</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Add Payment</h2>
            <form onSubmit={addPayment}>
              <label style={styles.label}>Property</label>
              <select style={styles.input} value={paymentForm.propertyId} onChange={(e) => setPaymentForm({ ...paymentForm, propertyId: e.target.value })}>
                <option value="">Select property</option>
                {companyProperties.map((property) => (
                  <option key={property.id} value={property.id}>{property.address}</option>
                ))}
              </select>
              <label style={styles.label}>Payment Date</label>
              <input style={styles.input} type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} />
              <label style={styles.label}>Amount</label>
              <input style={styles.input} type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              <label style={styles.label}>Method</label>
              <select style={styles.input} value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option value="Cash">Cash</option>
                <option value="Bank Deposit">Bank Deposit</option>
                <option value="Check">Check</option>
                <option value="Money Order">Money Order</option>
                <option value="Cash App">Cash App</option>
                <option value="Zelle">Zelle</option>
                <option value="Venmo">Venmo</option>
              </select>
              <label style={styles.label}>Note</label>
              <input style={styles.input} value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} />
              <button style={styles.primaryButton} type="submit">Save Payment</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'overrides' && (
        <div style={styles.card}>
          <div style={styles.reportHeaderRow}>
            <div>
              <h2 style={styles.cardTitle}>Monthly Overrides</h2>
              <p style={styles.smallMuted}>Use this for prorated rent, monthly tenant changes, move-in / move-out dates, starting balances, and notes.</p>
            </div>
            <div style={styles.actionRow}>
              <button style={styles.smallPrimaryButton} type="button" onClick={rollMonthForward}>
                Roll Active Properties to {monthLabel(nextMonthKey)}
              </button>
            </div>
          </div>

          <div style={styles.notesBox}>
            <strong>Quick setup:</strong> This creates next-month override rows only for properties with an active tenant on {formatDate(startOfMonth(nextMonthKey))}. It keeps the standard property rent, carries the ending balance forward, and leaves any existing next-month override rows untouched.
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Property</th>
                  <th style={styles.th}>Tenant Override</th>
                  <th style={styles.th}>Override Rent</th>
                  <th style={styles.th}>Start Bal</th>
                  <th style={styles.th}>Move In</th>
                  <th style={styles.th}>Move Out</th>
                  <th style={styles.th}>Notes</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {companyProperties.map((property) => {
                  const current = companyOverrides.find(
                    (item) => item.property_id === property.id && item.month_key === selectedMonth
                  )

                  const isEditing = editingOverrideId === property.id

                  return (
                    <tr key={`override-${property.id}`}>
                      <td style={styles.td}>{property.address}</td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.tableInput} value={overrideForm.tenantOverride} onChange={(e) => setOverrideForm({ ...overrideForm, tenantOverride: e.target.value })} />
                        ) : (current?.tenant_override || '—')}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.tableInput} type="number" value={overrideForm.overrideRent} onChange={(e) => setOverrideForm({ ...overrideForm, overrideRent: e.target.value })} />
                        ) : (current?.override_rent !== null && current?.override_rent !== undefined ? currency(current.override_rent) : '—')}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.tableInput} type="number" value={overrideForm.startingBalance} onChange={(e) => setOverrideForm({ ...overrideForm, startingBalance: e.target.value })} />
                        ) : (current?.starting_balance ? currency(current.starting_balance) : '—')}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.tableInput} type="date" value={overrideForm.moveInDate} onChange={(e) => setOverrideForm({ ...overrideForm, moveInDate: e.target.value })} />
                        ) : (current?.move_in_date || '—')}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.tableInput} type="date" value={overrideForm.moveOutDate} onChange={(e) => setOverrideForm({ ...overrideForm, moveOutDate: e.target.value })} />
                        ) : (current?.move_out_date || '—')}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.tableInput} value={overrideForm.notes} onChange={(e) => setOverrideForm({ ...overrideForm, notes: e.target.value })} />
                        ) : (current?.notes || '—')}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionRow}>
                          {isEditing ? (
                            <>
                              <button style={styles.smallPrimaryButton} type="button" onClick={() => saveOverride(property.id)}>Save</button>
                              <button style={styles.smallSecondaryButton} type="button" onClick={cancelEditingOverride}>Cancel</button>
                            </>
                          ) : (
                            <button style={styles.smallSecondaryButton} type="button" onClick={() => startEditingOverride(property.id, current)}>Edit</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {activeTab === 'ledger' && (
        <div style={styles.sectionGridSingle}>
          <div style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Property Ledger</h2>
                <p style={styles.smallMuted}>
                  One running account view for charges, late fees, adjustments, payments, and carried balances.
                </p>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(propertyLedgerRef, 'Property Ledger')}
                >
                  Print Ledger
                </button>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={exportPropertyLedgerCsv}
                >
                  Export Ledger CSV
                </button>
              </div>
            </div>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Property</label>
                <select
                  style={styles.input}
                  value={selectedReportPropertyId}
                  onChange={(e) => setSelectedReportPropertyId(e.target.value)}
                >
                  <option value="">Select property</option>
                  {companyProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Start Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>End Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div ref={propertyLedgerRef} style={styles.card}>
            <div style={styles.reportPrintHeader}>
              <div style={styles.reportPrintTitle}>Property Ledger</div>
              <div style={styles.reportPrintMeta}>
                <strong>Company:</strong> {selectedCompanyName}
              </div>
              <div style={styles.reportPrintMeta}>
                <strong>Property:</strong> {selectedReportProperty ? selectedReportProperty.address : '—'}
              </div>
              <div style={styles.reportPrintMeta}>
                <strong>Date Range:</strong> {reportStartDate ? formatDate(reportStartDate) : 'Beginning'} - {reportEndDate ? formatDate(reportEndDate) : 'Present'}
              </div>
            </div>

            <div style={styles.ledgerSummaryGrid}>
              <div style={styles.ledgerMiniCard}>
                <div style={styles.kpiLabel}>Rent Charges</div>
                <div style={styles.ledgerMiniValue}>{currency(selectedPropertyLedgerTotals.rentCharges)}</div>
              </div>
              <div style={styles.ledgerMiniCard}>
                <div style={styles.kpiLabel}>Late Fees</div>
                <div style={styles.ledgerMiniValue}>{currency(selectedPropertyLedgerTotals.lateFees)}</div>
              </div>
              <div style={styles.ledgerMiniCard}>
                <div style={styles.kpiLabel}>Adjustments</div>
                <div style={styles.ledgerMiniValue}>{currency(selectedPropertyLedgerTotals.adjustments)}</div>
              </div>
              <div style={styles.ledgerMiniCard}>
                <div style={styles.kpiLabel}>Payments / Credits</div>
                <div style={styles.ledgerMiniValue}>{currency(selectedPropertyLedgerTotals.credits)}</div>
              </div>
              <div style={styles.ledgerMiniCard}>
                <div style={styles.kpiLabel}>Ending Balance</div>
                <div style={styles.ledgerMiniValue}>{currency(selectedPropertyLedgerTotals.endingBalance)}</div>
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Month</th>
                    <th style={styles.th}>Tenant</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Description</th>
                    <th style={styles.th}>Charge</th>
                    <th style={styles.th}>Credit</th>
                    <th style={styles.th}>Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedReportProperty ? (
                    <tr>
                      <td style={styles.td} colSpan="8">Select a property to view its ledger.</td>
                    </tr>
                  ) : selectedPropertyLedgerRows.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan="8">No ledger activity for the selected date range.</td>
                    </tr>
                  ) : (
                    selectedPropertyLedgerRows.map((row, index) => (
                      <tr key={`ledger-${row.type}-${row.date}-${index}`}>
                        <td style={styles.td}>{formatDate(row.date)}</td>
                        <td style={styles.td}>{row.month ? monthLabel(row.month) : '—'}</td>
                        <td style={styles.td}>{row.tenantName || '—'}</td>
                        <td style={styles.td}>{formatLedgerEntryType(row.type)}</td>
                        <td style={styles.td}>
                          {row.description}
                          {row.note ? <div style={styles.smallMuted}>Note: {row.note}</div> : null}
                        </td>
                        <td style={styles.td}>{row.type === 'payment' ? '—' : currency(row.amount)}</td>
                        <td style={styles.td}>{row.type === 'payment' ? currency(Math.abs(row.amount)) : '—'}</td>
                        <td style={styles.td}>{currency(row.runningBalance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div style={styles.sectionGridSingle}>
          <div style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Owner Monthly Report</h2>
                <p style={styles.smallMuted}>{selectedCompanyName} — {monthLabel(selectedMonth)}</p>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(ownerReportRef, 'Owner Monthly Report')}
                >
                  Print Owner Report
                </button>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={emailOwnerReport}
                >
                  Email Owner Report
                </button>
              </div>
            </div>

            <div ref={ownerReportRef}>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Property</th>
                      <th style={styles.th}>Tenant</th>
                      <th style={styles.th}>Rent</th>
                      <th style={styles.th}>Collected</th>
                      <th style={styles.th}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan="5">No properties yet for this company.</td>
                      </tr>
                    ) : (
                      ledgerRows.map((row) => (
                        <tr key={`report-${row.id}`}>
                          <td style={styles.td}>{row.address}</td>
                          <td style={styles.td}>{row.effectiveTenant}</td>
                          <td style={styles.td}>{currency(row.effectiveRent)}</td>
                          <td style={styles.td}>{currency(row.totalPaid)}</td>
                          <td style={styles.td}>{currency(row.balanceRemaining)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={styles.reportTotals}>
                <div><strong>Monthly Rent:</strong> {currency(totalMonthlyRent)}</div>
                <div><strong>Collected:</strong> {currency(totalCollected)}</div>
                <div><strong>Outstanding:</strong> {currency(totalOutstanding)}</div>
                <div><strong>10% Management Fee:</strong> {currency(managementFeeCollected)}</div>
              </div>

              <div style={styles.notesBox}>
                <strong>Notes:</strong> Balances reflect prior unpaid amounts carried forward. Prorated rents and tenant changes are applied where applicable. Management fee is calculated at 10% of collected rent.
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Statement Filters</h2>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Property</label>
                <select
                  style={styles.input}
                  value={selectedReportPropertyId}
                  onChange={(e) => setSelectedReportPropertyId(e.target.value)}
                >
                  <option value="">Select property</option>
                  {companyProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Tenant</label>
                <select
                  style={styles.input}
                  value={selectedTenantName}
                  onChange={(e) => setSelectedTenantName(e.target.value)}
                >
                  <option value="">Select tenant</option>
                  {companyTenantNames.map((tenantName) => (
                    <option key={tenantName} value={tenantName}>
                      {tenantName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Start Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>End Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Property Statement</h2>
                <p style={styles.smallMuted}>
                  {selectedReportProperty ? selectedReportProperty.address : 'Select a property'}
                </p>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(propertyStatementRef, 'Property Statement')}
                >
                  Print Property Statement
                </button>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={exportPropertyStatementCsv}
                >
                  Export Property CSV
                </button>
              </div>
            </div>

            <div ref={propertyStatementRef}>
              <div style={styles.reportPrintHeader}>
                <div style={styles.reportPrintTitle}>Property Statement</div>
                <div style={styles.reportPrintMeta}>
                  <strong>Property:</strong> {selectedReportProperty ? selectedReportProperty.address : '—'}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Date Range:</strong> {reportStartDate ? formatDate(reportStartDate) : 'Beginning'} - {reportEndDate ? formatDate(reportEndDate) : 'Present'}
                </div>
              </div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Description</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedReportProperty ? (
                      <tr>
                        <td style={styles.td} colSpan="5">Select a property to view its statement.</td>
                      </tr>
                    ) : selectedPropertyStatementRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan="5">No statement activity for the selected date range.</td>
                      </tr>
                    ) : (
                      selectedPropertyStatementRows.map((row, index) => (
                        <tr key={`${row.type}-${row.date}-${index}`}>
                          <td style={styles.td}>{formatDate(row.date)}</td>
                          <td style={styles.td}>{formatLedgerEntryType(row.type)}</td>
                          <td style={styles.td}>
                            {row.description}
                            {row.note ? <div style={styles.smallMuted}>Note: {row.note}</div> : null}
                          </td>
                          <td style={styles.td}>{formatLedgerAmount(row)}</td>
                          <td style={styles.td}>{currency(row.runningBalance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Tenant Statement</h2>
                <p style={styles.smallMuted}>
                  {selectedTenantName || 'Select a tenant'}
                </p>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(tenantStatementRef, 'Tenant Statement')}
                >
                  Print Tenant Statement
                </button>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={exportTenantStatementCsv}
                >
                  Export Tenant CSV
                </button>
              </div>
            </div>

            <div ref={tenantStatementRef}>
              <div style={styles.reportPrintHeader}>
                <div style={styles.reportPrintTitle}>Tenant Statement</div>
                <div style={styles.reportPrintMeta}>
                  <strong>Tenant:</strong> {selectedTenantName || '—'}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Date Range:</strong> {reportStartDate ? formatDate(reportStartDate) : 'Beginning'} - {reportEndDate ? formatDate(reportEndDate) : 'Present'}
                </div>
              </div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Property</th>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Description</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedTenantName ? (
                      <tr>
                        <td style={styles.td} colSpan="6">Select a tenant to view the tenant statement.</td>
                      </tr>
                    ) : selectedTenantStatementRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan="6">No tenant activity for the selected date range.</td>
                      </tr>
                    ) : (
                      selectedTenantStatementRows.map((row, index) => (
                        <tr key={`${row.propertyAddress}-${row.type}-${row.date}-${index}`}>
                          <td style={styles.td}>{formatDate(row.date)}</td>
                          <td style={styles.td}>{row.propertyAddress}</td>
                          <td style={styles.td}>{formatLedgerEntryType(row.type)}</td>
                          <td style={styles.td}>
                            {row.description}
                            {row.note ? <div style={styles.smallMuted}>Note: {row.note}</div> : null}
                          </td>
                          <td style={styles.td}>{formatLedgerAmount(row)}</td>
                          <td style={styles.td}>{currency(row.runningBalance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#f8fafc', padding: '20px', fontFamily: 'Arial, sans-serif', color: '#0f172a' },
  authPage: { minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Arial, sans-serif' },
  authCard: { width: '100%', maxWidth: '420px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' },
  authTitle: { margin: '0 0 8px 0', fontSize: '34px' },
  authSubtitle: { margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' },
  loadingCard: { maxWidth: '500px', margin: '40px auto', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' },
  title: { margin: 0, fontSize: '42px', lineHeight: 1.1 },
  subtitle: { margin: '8px 0 0 0', color: '#64748b', fontSize: '15px' },
  headerActions: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  topControls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' },
  controlBlock: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px' },
  tabRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' },
  tabButton: { background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 },
  activeTabButton: { background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '18px' },
  kpiCard: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)' },
  kpiLabel: { color: '#64748b', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.04em' },
  kpiValue: { fontSize: '28px', fontWeight: 700 },
  kpiValueSmall: { fontSize: '18px', fontWeight: 700, lineHeight: 1.3 },
  sectionGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '16px' },
  sectionGridSingle: { display: 'grid', gap: '16px' },
  card: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' },
  cardTitle: { marginTop: 0, marginBottom: '12px', fontSize: '22px' },
  label: { display: 'block', marginBottom: '6px', marginTop: '12px', fontSize: '14px', fontWeight: 600 },
  input: { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '14px' },
  tableInput: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '14px' },
  primaryButton: { marginTop: '16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '12px', padding: '11px 16px', cursor: 'pointer', fontWeight: 600 },
  secondaryButton: { background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '12px', padding: '11px 16px', cursor: 'pointer', fontWeight: 600 },
  smallPrimaryButton: { background: '#0f172a', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  smallSecondaryButton: { background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  smallDangerButton: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  buttonRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' },
  actionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  reportHeaderRow: { display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' },
  reportTotals: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginTop: '16px', fontSize: '14px' },
  statementFilterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  ledgerSummaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' },
  ledgerMiniCard: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px' },
  ledgerMiniValue: { fontSize: '22px', fontWeight: 700 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '12px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '14px', verticalAlign: 'top' },
  smallMuted: { color: '#64748b', fontSize: '14px' },
  message: { marginTop: '16px', color: '#b91c1c', fontSize: '14px' },
  messageBanner: { marginBottom: '18px', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: '12px', padding: '12px 14px', fontSize: '14px' },
  notesBox: { marginTop: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', fontSize: '14px', color: '#334155' },
  reportPrintHeader: { marginBottom: '14px' },
  reportPrintTitle: { fontSize: '24px', fontWeight: 700, marginBottom: '6px' },
  reportPrintMeta: { fontSize: '14px', color: '#334155', marginBottom: '4px' },
}
