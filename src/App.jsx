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

function formatMonthYear(month) {
  return monthLabel(month)
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 768
}


function getNextMonthKey(month) {
  const [year, mon] = month.split('-').map(Number)
  const nextDate = new Date(year, mon, 1)
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '—'
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US')
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US')
}

function getReportDateRangeLabel(startDate, endDate) {
  const start = startDate ? formatDate(startDate) : 'Beginning'
  const end = endDate ? formatDate(endDate) : 'Present'
  return `${start} - ${end}`
}

function getGeneratedOnLabel() {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}


function getCurrentMonthKey() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getTodayDateInput() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDateInputValue(value) {
  if (!value) return ''
  const raw = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    let year = Number(slashMatch[3])
    if (year < 100) year += 2000
    const month = String(Number(slashMatch[1])).padStart(2, '0')
    const day = String(Number(slashMatch[2])).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function getChargeDateForMonth(month, dueDay, firstOccupiedDate = '') {
  const monthEnd = endOfMonth(month)
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  const safeDueDay = Math.min(Math.max(Number(dueDay || 1), 1), lastDay)
  const dueDate = `${month}-${String(safeDueDay).padStart(2, '0')}`

  if (firstOccupiedDate && String(firstOccupiedDate).slice(0, 10) > dueDate) {
    return String(firstOccupiedDate).slice(0, 10)
  }

  return dueDate
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

function confirmDeleteWithPrompt(message, requiredText = 'DELETE') {
  const initialConfirm = window.confirm(message)
  if (!initialConfirm) return false

  const typed = window.prompt(`Type ${requiredText} to continue.`)
  if (typed !== requiredText) {
    window.alert('Delete canceled.')
    return false
  }

  return true
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().trim()
}

function matchesSearch(text, search) {
  if (!search) return true
  return normalizeSearchText(text).includes(search)
}

function isManualLateFeeEntry(payment) {
  return String(payment?.method || '').toLowerCase() === 'late fee'
}

function buildSecurityDepositRecord(current = {}) {
  return {
    id: current.id || '',
    propertyId: current.propertyId || current.property_id || '',
    tenant: current.tenant || '',
    requiredAmount: current.requiredAmount ?? current.required_amount ?? '',
    petRequiredAmount: current.petRequiredAmount ?? current.pet_required_amount ?? '',
    dueDate: current.dueDate || current.due_date || '',
    petDueDate: current.petDueDate || current.pet_due_date || current.dueDate || current.due_date || '',
    payments: Array.isArray(current.payments) ? current.payments : [],
    refundDate: current.refundDate || current.refund_date || '',
    refundAmount: current.refundAmount ?? current.refund_amount ?? '',
    deductionAmount: current.deductionAmount ?? current.deduction_amount ?? '',
    deductionNote: current.deductionNote || current.deduction_note || '',
  }
}

function securityDepositKey(propertyId, tenant = '') {
  return `${propertyId || ''}::${String(tenant || '').trim()}`
}

function buildSecurityDepositMap(profileRows = [], paymentRows = []) {
  const rowsByKey = {}

  profileRows.forEach((row) => {
    const key = securityDepositKey(row.property_id, row.tenant)
    rowsByKey[key] = buildSecurityDepositRecord({
      id: row.id,
      propertyId: row.property_id,
      tenant: row.tenant || '',
      requiredAmount: row.required_amount,
      petRequiredAmount: row.pet_required_amount,
      dueDate: row.due_date,
      petDueDate: row.pet_due_date || row.due_date,
      refundDate: row.refund_date,
      refundAmount: row.refund_amount,
      deductionAmount: row.deduction_amount,
      deductionNote: row.deduction_note,
      payments: [],
    })
  })

  paymentRows.forEach((row) => {
    const key = securityDepositKey(row.property_id, row.tenant)
    if (!rowsByKey[key]) {
      rowsByKey[key] = buildSecurityDepositRecord({
        propertyId: row.property_id,
        tenant: row.tenant || '',
        payments: [],
      })
    }
    rowsByKey[key].payments.push({
      id: row.id,
      paymentDate: row.payment_date || '',
      amount: Number(row.amount || 0),
      method: row.method || 'Cash',
      paymentType: row.payment_type || row.deposit_type || 'security',
      note: row.note || '',
    })
  })

  Object.values(rowsByKey).forEach((record) => {
    record.payments = [...record.payments].sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate)))
  })

  return rowsByKey
}

function buildLeaseOnboardingForm(current = {}) {
  return {
    propertyId: current.propertyId || '',
    tenantNames: current.tenantNames || current.tenant_names || '',
    tenantPhone: current.tenantPhone || current.tenant_phone || '',
    tenantEmail: current.tenantEmail || current.tenant_email || '',
    tenant2Name: current.tenant2Name || current.tenant_2_name || '',
    tenant2Phone: current.tenant2Phone || current.tenant_2_phone || '',
    tenant2Email: current.tenant2Email || current.tenant_2_email || '',
    tenantContactNotes: current.tenantContactNotes || current.tenant_contact_notes || '',
    occupants: current.occupants || '',
    leaseDate: current.leaseDate || getTodayDateInput(),
    leaseStartDate: current.leaseStartDate || getTodayDateInput(),
    leaseEndDate: current.leaseEndDate || '',
    termMonths: current.termMonths || '12',
    propertyAddress: current.propertyAddress || '',
    propertyState: current.propertyState || 'LA',
    propertyZip: current.propertyZip || '',
    monthlyRent: current.monthlyRent || '',
    grossRent: current.grossRent || '',
    proratedRent: current.proratedRent || '0',
    moveInDate: current.moveInDate || getTodayDateInput(),
    lastDayFirstMonth: current.lastDayFirstMonth || endOfMonth(getCurrentMonthKey()),
    depositAmount: current.depositAmount || '',
    hasPets: current.hasPets || 'no',
    numberOfPets: current.numberOfPets || '',
    petNames: current.petNames || '',
    petDepositAmount: current.petDepositAmount || '',
    propertyManagerName: current.propertyManagerName || 'Madeline Tatum',
    propertyManagerPhone: current.propertyManagerPhone || '(985) 335-4302',
    includePetAddendum: current.includePetAddendum ?? true,
  }
}

function formatLeaseMoney(value) {
  if (value === '' || value === null || value === undefined) return '__________'
  return currency(value)
}

function getDayNumber(dateValue) {
  const normalized = normalizeDateInputValue(dateValue)
  if (!normalized) return '____'
  return String(Number(normalized.slice(8, 10)))
}

function getMonthYearLabel(dateValue) {
  const normalized = normalizeDateInputValue(dateValue)
  if (!normalized) return '________________'
  const [year, month] = normalized.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getMonthLabelOnly(dateValue) {
  const normalized = normalizeDateInputValue(dateValue)
  if (!normalized) return '________________'
  const [year, month] = normalized.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })
}

function getYearLabelOnly(dateValue) {
  const normalized = normalizeDateInputValue(dateValue)
  if (!normalized) return '____'
  return normalized.slice(0, 4)
}

function getLeaseFileName(leaseForm) {
  const tenant = String(leaseForm.tenantNames || 'Tenant').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
  const property = String(leaseForm.propertyAddress || 'Lease').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return `${tenant || 'Tenant'}_${property || 'Lease'}_Lease`
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState(isMobileViewport() ? 'payments' : 'dashboard')
  const [isMobile, setIsMobile] = useState(isMobileViewport())

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [companies, setCompanies] = useState([])
  const [properties, setProperties] = useState([])
  const [payments, setPayments] = useState([])
  const [leases, setLeases] = useState([])
  const [tenants, setTenants] = useState([])
  const [monthlyOverrides, setMonthlyOverrides] = useState([])

  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey())
  const [selectedReportPropertyId, setSelectedReportPropertyId] = useState('')
  const [selectedTenantName, setSelectedTenantName] = useState('')
  const [selectedReportView, setSelectedReportView] = useState('owner')
  const [selectedBankDepositPeriod, setSelectedBankDepositPeriod] = useState('month')
  const [selectedBankDepositPropertyId, setSelectedBankDepositPropertyId] = useState('')
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')
  const [showArchivedProperties, setShowArchivedProperties] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [propertyNotes, setPropertyNotes] = useState({})
  const [selectedNotesPropertyId, setSelectedNotesPropertyId] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [logoRefreshKey, setLogoRefreshKey] = useState(0)
  const [embeddedReportLogoSrc, setEmbeddedReportLogoSrc] = useState('')
  const [securityDeposits, setSecurityDeposits] = useState({})
  const [selectedDepositPropertyId, setSelectedDepositPropertyId] = useState('')
  const [depositDraft, setDepositDraft] = useState(buildSecurityDepositRecord())
  const [depositPaymentForm, setDepositPaymentForm] = useState({
    paymentDate: getTodayDateInput(),
    amount: '',
    method: 'Cash',
    paymentType: 'security',
    note: '',
  })

  const [leaseForm, setLeaseForm] = useState(buildLeaseOnboardingForm())
  const [uploadingLeaseId, setUploadingLeaseId] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)

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
    paymentDate: getTodayDateInput(),
    amount: '',
    method: 'Cash',
    note: '',
  })
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState('')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isListening, setIsListening] = useState(false)

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
  const managementInvoiceRef = useRef(null)
  const bankDepositReportRef = useRef(null)
  const propertyLedgerRef = useRef(null)
  const leasePreviewRef = useRef(null)
  const speechRecognitionRef = useRef(null)
  const voiceTranscriptRef = useRef(null)

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
  useEffect(() => {
    function handleResize() {
      const mobileNow = isMobileViewport()
      setIsMobile(mobileNow)
      setActiveTab((current) => {
        if (mobileNow && current === 'dashboard') return 'payments'
        if (!mobileNow && current === 'mobileHome') return 'dashboard'
        return current
      })
    }

    if (typeof window !== 'undefined') {
      handleResize()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])


  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop()
        } catch (error) {
          console.error('Unable to stop speech recognition.', error)
        }
      }
    }
  }, [])


  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedMethod = window.localStorage.getItem('rentTrackerLastPaymentMethod')
    if (savedMethod) {
      setPaymentForm((current) => ({
        ...current,
        method: current.method || savedMethod,
      }))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedMonth = window.localStorage.getItem('rentTrackerSelectedMonth')
    const currentMonth = getCurrentMonthKey()

    if (savedMonth && monthOptions.includes(savedMonth)) {
      setSelectedMonth(savedMonth)
      return
    }

    if (monthOptions.includes(currentMonth)) {
      setSelectedMonth(currentMonth)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('rentTrackerSelectedMonth', selectedMonth)
  }, [selectedMonth])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const savedNotes = window.localStorage.getItem('rentTrackerPropertyNotes')
      if (savedNotes) {
        setPropertyNotes(JSON.parse(savedNotes))
      }
    } catch (error) {
      console.error('Unable to load saved property notes.', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('rentTrackerPropertyNotes', JSON.stringify(propertyNotes))
  }, [propertyNotes])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let isCancelled = false

    async function loadEmbeddedLogo() {
      try {
        const response = await fetch(logoSrc, { cache: 'reload' })
        const blob = await response.blob()
        const reader = new FileReader()
        reader.onloadend = () => {
          if (!isCancelled) {
            setEmbeddedReportLogoSrc(typeof reader.result === 'string' ? reader.result : '')
          }
        }
        reader.readAsDataURL(blob)
      } catch (error) {
        console.error('Unable to embed report logo.', error)
        if (!isCancelled) setEmbeddedReportLogoSrc('')
      }
    }

    loadEmbeddedLogo()
    return () => {
      isCancelled = true
    }
  }, [logoRefreshKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    function handleReturnFromPrint() {
      setTimeout(() => {
        refreshLogos()
      }, 100)
    }

    window.addEventListener('focus', handleReturnFromPrint)
    window.addEventListener('pageshow', handleReturnFromPrint)
    return () => {
      window.removeEventListener('focus', handleReturnFromPrint)
      window.removeEventListener('pageshow', handleReturnFromPrint)
    }
  }, [])


  function browserSupportsVoiceEntry() {
    if (typeof window === 'undefined') return false
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  function normalizeAddressText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bsaint\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\broad\b/g, 'rd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\blane\b/g, 'ln')
      .replace(/\bapartment\b/g, 'apt')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function wordToNumberToken(word) {
    const map = {
      zero: 0,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
    }
    return map[word]
  }

  function parseNumberWords(segment) {
    if (!segment) return null

    const cleaned = String(segment)
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/ and /g, ' ')
      .replace(/ dollars?/g, ' ')
      .replace(/ cents?/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned) return null

    const tokens = cleaned.split(' ')
    let total = 0
    let current = 0
    let matched = false

    for (const token of tokens) {
      if (token === 'hundred') {
        current = (current || 1) * 100
        matched = true
        continue
      }

      if (token === 'thousand') {
        total += (current || 1) * 1000
        current = 0
        matched = true
        continue
      }

      const numeric = wordToNumberToken(token)
      if (numeric !== undefined) {
        current += numeric
        matched = true
      }
    }

    const amount = total + current
    return matched && amount > 0 ? amount : null
  }

  function parseSpokenAmount(transcript) {
    const numericMatch = String(transcript || '').match(/\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/)
    if (numericMatch) {
      const parsed = Number(numericMatch[1].replace(/,/g, ''))
      if (!Number.isNaN(parsed) && parsed > 0) return parsed
    }

    const lower = String(transcript || '').toLowerCase()
    const amountPhraseMatch = lower.match(/(?:amount|for|paid|payment|received)\s+([a-z\s-]+?)(?:\s+(?:cash|check|zelle|venmo|cash app|money order|bank deposit|deposit|today|yesterday|note|on|dated)\b|$)/)
    if (amountPhraseMatch) {
      const parsed = parseNumberWords(amountPhraseMatch[1])
      if (parsed) return parsed
    }

    return parseNumberWords(lower)
  }

  function parseSpokenMethod(transcript) {
    const lower = String(transcript || '').toLowerCase()
    if (lower.includes('cash app')) return 'Cash App'
    if (lower.includes('bank deposit') || lower.includes('deposit')) return 'Bank Deposit'
    if (lower.includes('money order')) return 'Money Order'
    if (lower.includes('zelle')) return 'Zelle'
    if (lower.includes('venmo')) return 'Venmo'
    if (lower.includes('check')) return 'Check'
    if (lower.includes('cash')) return 'Cash'
    return ''
  }

  function parseSpokenDate(transcript) {
    const raw = String(transcript || '')
    const lower = raw.toLowerCase()

    if (lower.includes('today')) return getTodayDateInput()
    if (lower.includes('yesterday')) return addDays(getTodayDateInput(), -1)

    const slashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (slashMatch) {
      let year = slashMatch[3] ? Number(slashMatch[3]) : new Date().getFullYear()
      if (year < 100) year += 2000
      const month = String(Number(slashMatch[1])).padStart(2, '0')
      const day = String(Number(slashMatch[2])).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const monthNamePattern = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i
    const monthMatch = raw.match(monthNamePattern)
    if (monthMatch) {
      const parsed = new Date(`${monthMatch[1]} ${monthMatch[2]} ${monthMatch[3] || new Date().getFullYear()}`)
      if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear()
        const mm = String(parsed.getMonth() + 1).padStart(2, '0')
        const dd = String(parsed.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
      }
    }

    return ''
  }

  function findPropertyFromTranscript(transcript) {
    const normalizedTranscript = normalizeAddressText(transcript)
    if (!normalizedTranscript) return null

    let bestMatch = null
    let bestScore = 0

    activeCompanyProperties.forEach((property) => {
      const normalizedAddress = normalizeAddressText(property.address)
      if (!normalizedAddress) return

      let score = 0

      if (normalizedTranscript.includes(normalizedAddress)) {
        score += normalizedAddress.length + 100
      }

      const addressTokens = normalizedAddress.split(' ').filter(Boolean)
      addressTokens.forEach((token) => {
        if (token.length >= 2 && normalizedTranscript.includes(token)) {
          score += token.length
        }
      })

      const numberMatch = normalizedAddress.match(/^\d+[a-z]?/)
      if (numberMatch && normalizedTranscript.includes(numberMatch[0])) {
        score += 50
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = property
      }
    })

    return bestScore >= 6 ? bestMatch : null
  }

  function applyVoicePaymentTranscript(transcript) {
    const property = findPropertyFromTranscript(transcript)
    const paymentDate = parseSpokenDate(transcript) || getTodayDateInput()
    const amount = parseSpokenAmount(transcript)
    const method = parseSpokenMethod(transcript)
    const note = `Voice entry: ${transcript}`

    setPaymentSuccessMessage('')
    setPaymentForm((current) => ({
      ...current,
      propertyId: property?.id || current.propertyId,
      paymentDate: paymentDate || current.paymentDate || getTodayDateInput(),
      amount: amount ? String(amount) : current.amount,
      method: method || current.method || 'Cash',
      note,
    }))

    const missing = []
    if (!property) missing.push('property')
    if (!amount) missing.push('amount')
    if (!method) missing.push('method')

    if (missing.length === 0) {
      setVoiceStatus('Voice entry filled the payment form. Review and save when ready.')
    } else {
      setVoiceStatus(`Voice entry filled what it could. Please review: missing ${missing.join(', ')}.`)
    }
  }

  function stopVoiceEntry() {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch (error) {
        console.error('Unable to stop speech recognition.', error)
      }
    }
    setIsListening(false)
  }

  function focusTranscriptForKeyboardMic() {
    if (voiceTranscriptRef.current) {
      voiceTranscriptRef.current.focus()
    }
    setVoiceStatus('Tap the microphone on your phone keyboard, speak the payment details, then press Apply Transcript.')
  }

  function startVoiceEntry() {
    if (!browserSupportsVoiceEntry()) {
      setVoiceStatus('Voice entry works in supported browsers like Chrome or Edge.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    speechRecognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    setVoiceTranscript('')
    setVoiceStatus('Listening… say the property, date, amount, and method.')
    setIsListening(true)

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || ''
      setVoiceTranscript(transcript)
      applyVoicePaymentTranscript(transcript)
    }

    recognition.onerror = (event) => {
      const errorMessage = event?.error === 'not-allowed'
        ? 'Microphone permission was blocked.'
        : 'Voice entry did not complete. Please try again.'
      setVoiceStatus(errorMessage)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.start()
  }

  async function loadData() {
    setLoading(true)
    setMessage('')

    const [
      { data: companyData, error: companyError },
      { data: propertyData, error: propertyError },
      { data: paymentData, error: paymentError },
      { data: leaseData, error: leaseError },
      { data: tenantData, error: tenantError },
      { data: overrideData, error: overrideError },
      { data: depositProfileData, error: depositProfileError },
      { data: depositPaymentData, error: depositPaymentError },
    ] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: true }),
      supabase.from('properties').select('*').order('created_at', { ascending: true }),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('leases').select('*').order('created_at', { ascending: false }),
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('monthly_overrides').select('*').order('month_key', { ascending: true }),
      supabase.from('security_deposits').select('*').order('created_at', { ascending: true }),
      supabase.from('security_deposit_payments').select('*').order('payment_date', { ascending: true }),
    ])

    if (companyError) setMessage(companyError.message)
    if (propertyError) setMessage(propertyError.message)
    if (paymentError) setMessage(paymentError.message)
    if (leaseError) console.error('Lease record load failed.', leaseError)
    if (tenantError) console.error('Tenant profile load failed.', tenantError)
    if (overrideError) setMessage(overrideError.message)
    if (depositProfileError) console.error('Security deposit profile load failed.', depositProfileError)
    if (depositPaymentError) console.error('Security deposit payment load failed.', depositPaymentError)

    const safeCompanies = companyData || []
    const safeProperties = propertyData || []
    const safePayments = paymentData || []
    const safeLeases = leaseData || []
    const safeTenants = tenantData || []
    const safeOverrides = overrideData || []
    const safeDepositProfiles = depositProfileData || []
    const safeDepositPayments = depositPaymentData || []

    setCompanies(safeCompanies)
    setProperties(safeProperties)
    setPayments(safePayments)
    setLeases(safeLeases)
    setTenants(safeTenants)
    setMonthlyOverrides(safeOverrides)
    setSecurityDeposits(buildSecurityDepositMap(safeDepositProfiles, safeDepositPayments))

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
    const confirmed = confirmDeleteWithPrompt(
      `Delete company: ${companyName}?\n\nThis is permanent and may also remove related properties and records.`
    )
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
    setMessage(`Company deleted: ${companyName}.`)
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

  async function savePaymentEntry({ addAnother = false, entryType = 'payment' } = {}) {
    setMessage('')
    setPaymentSuccessMessage('')

    if (!paymentForm.propertyId) {
      setMessage('Please select a property.')
      return
    }

    if (!paymentForm.paymentDate) {
      setMessage('Please enter a payment date.')
      return
    }

    const property = activeCompanyProperties.find((item) => item.id === paymentForm.propertyId) || companyProperties.find((item) => item.id === paymentForm.propertyId)
    const amountToUse =
      paymentForm.amount && Number(paymentForm.amount) > 0
        ? Number(paymentForm.amount)
        : entryType === 'late_fee'
          ? Number(property?.late_fee || 0)
          : 0

    if (!amountToUse || Number(amountToUse) <= 0) {
      setMessage(entryType === 'late_fee'
        ? 'Please enter a late fee amount greater than zero, or save a default late fee on the property first.'
        : 'Please enter a payment amount greater than zero.')
      return
    }

    const postedMonth = monthKeyFromDate(paymentForm.paymentDate)
    const payload = {
      property_id: paymentForm.propertyId,
      payment_date: paymentForm.paymentDate,
      amount: Number(amountToUse || 0),
      method: entryType === 'late_fee' ? 'Late Fee' : paymentForm.method,
      note: paymentForm.note || null,
    }

    const { data: insertedPayment, error } = await supabase
      .from('payments')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    if (typeof window !== 'undefined' && entryType !== 'late_fee') {
      window.localStorage.setItem('rentTrackerLastPaymentMethod', paymentForm.method)
    }

    if (insertedPayment) {
      setPayments((current) => [insertedPayment, ...current.filter((item) => item.id !== insertedPayment.id)])

      const tenantName = property ? getTenantForDate(property, companyOverrides.filter((item) => item.property_id === property.id), paymentForm.paymentDate) || property.tenant || '' : ''
      const tenantRecord = property ? getTenantRecordForProperty(property.id, tenantName) : null
      const contactOptions = property ? getReceiptContactOptions(property.id) : []
      const receiptMessage = buildRentReceiptMessage({
        property,
        tenantName,
        paymentDate: paymentForm.paymentDate,
        amount: amountToUse,
        method: entryType === 'late_fee' ? 'Late Fee' : paymentForm.method,
        entryType,
        note: paymentForm.note || '',
      })
      setLastReceipt({
        type: entryType === 'late_fee' ? 'late_fee' : 'rent_payment',
        phone: tenantRecord?.phone || contactOptions[0]?.phone || '',
        contactOptions,
        tenantName,
        propertyId: property?.id || '',
        message: receiptMessage,
      })
    }

    if (postedMonth) {
      setSelectedMonth(postedMonth)
    }

    setPaymentSuccessMessage(
      entryType === 'late_fee'
        ? `Late fee saved for ${property?.address || 'selected property'} — ${currency(amountToUse)} on ${formatDate(paymentForm.paymentDate)}. Posted to ${monthLabel(postedMonth || selectedMonth)}.`
        : `Payment saved for ${property?.address || 'selected property'} — ${currency(amountToUse)} on ${formatDate(paymentForm.paymentDate)}. Posted to ${monthLabel(postedMonth || selectedMonth)}.`
    )

    setPaymentForm((current) => ({
      propertyId: addAnother ? current.propertyId : '',
      paymentDate: getTodayDateInput(),
      amount: '',
      method: entryType === 'late_fee' ? (current.method === 'Late Fee' ? 'Cash' : current.method || 'Cash') : current.method || 'Cash',
      note: '',
    }))

    await loadData()
  }

  async function addPayment(e) {
    e.preventDefault()
    await savePaymentEntry({ addAnother: false, entryType: 'payment' })
  }

  async function addPaymentAndContinue() {
    await savePaymentEntry({ addAnother: true, entryType: 'payment' })
  }

  async function addLateFee() {
    await savePaymentEntry({ addAnother: false, entryType: 'late_fee' })
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

  async function archiveProperty(propertyId, address) {
    const confirmed = window.confirm(
      `Archive property: ${address}?

This keeps the record for reporting but removes it from your active list.`
    )
    if (!confirmed) return

    setMessage('')

    const { error } = await supabase
      .from('properties')
      .update({ is_active: false })
      .eq('id', propertyId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (editingPropertyId === propertyId) cancelEditingProperty()
    await loadData()
    setMessage(`Property archived: ${address}.`)
  }

  async function restoreProperty(propertyId, address) {
    const confirmed = window.confirm(`Restore property: ${address}?`)
    if (!confirmed) return

    setMessage('')

    const { error } = await supabase
      .from('properties')
      .update({ is_active: true })
      .eq('id', propertyId)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadData()
    setMessage(`Property restored: ${address}.`)
  }

  function savePropertyNote() {
    if (!selectedNotesPropertyId) {
      setMessage('Please select a property for notes.')
      return
    }

    const trimmed = notesDraft.trim()

    setPropertyNotes((current) => ({
      ...current,
      [selectedNotesPropertyId]: {
        text: trimmed,
        updatedAt: new Date().toISOString(),
      },
    }))

    const property = companyProperties.find((item) => item.id === selectedNotesPropertyId)
    setMessage(`Notes saved for ${property?.address || 'selected property'}.`)
  }

  function clearPropertyNote() {
    if (!selectedNotesPropertyId) {
      setMessage('Please select a property for notes.')
      return
    }

    const property = companyProperties.find((item) => item.id === selectedNotesPropertyId)
    const confirmed = window.confirm(`Clear saved notes for ${property?.address || 'this property'}?`)
    if (!confirmed) return

    setPropertyNotes((current) => {
      const next = { ...current }
      delete next[selectedNotesPropertyId]
      return next
    })
    setNotesDraft('')
    setMessage(`Notes cleared for ${property?.address || 'selected property'}.`)
  }

  function updateDepositRecord(patch) {
    setDepositDraft((current) => ({
      ...buildSecurityDepositRecord(current),
      ...patch,
    }))
  }

  async function saveDepositRecord() {
    if (!selectedDepositPropertyId) {
      setMessage('Please select a property for security deposit tracking.')
      return
    }

    const currentTenant = getTenantForDate(
      selectedDepositProperty,
      companyOverrides.filter((item) => item.property_id === selectedDepositPropertyId),
      getTodayDateInput()
    ) || ''

    const payload = {
      property_id: selectedDepositPropertyId,
      tenant: currentTenant || null,
      required_amount: depositDraft.requiredAmount === '' ? null : Number(depositDraft.requiredAmount || 0),
      pet_required_amount: depositDraft.petRequiredAmount === '' ? null : Number(depositDraft.petRequiredAmount || 0),
      due_date: normalizeDateInputValue(depositDraft.dueDate) || null,
      pet_due_date: normalizeDateInputValue(depositDraft.petDueDate) || normalizeDateInputValue(depositDraft.dueDate) || null,
      refund_date: normalizeDateInputValue(depositDraft.refundDate) || null,
      refund_amount: depositDraft.refundAmount === '' ? null : Number(depositDraft.refundAmount || 0),
      deduction_amount: depositDraft.deductionAmount === '' ? null : Number(depositDraft.deductionAmount || 0),
      deduction_note: depositDraft.deductionNote || null,
    }

    const { error } = await supabase
      .from('security_deposits')
      .upsert(payload, { onConflict: 'property_id,tenant' })

    if (error) {
      setMessage(error.message)
      return
    }

    await loadData()
    setMessage('Security deposit details saved.')
  }

  async function addSecurityDepositPayment() {
    if (!selectedDepositPropertyId) {
      setMessage('Please select a property for security deposit tracking.')
      return
    }

    const tenant = selectedDepositTenant || ''
    if (!tenant) {
      setMessage('No current tenant is set for this property, so the security deposit cannot be tied to a tenant yet.')
      return
    }

    if (!depositPaymentForm.paymentDate || !depositPaymentForm.amount || Number(depositPaymentForm.amount) <= 0) {
      setMessage('Please enter a deposit payment date and amount greater than zero.')
      return
    }

    const { error } = await supabase
      .from('security_deposit_payments')
      .insert({
        property_id: selectedDepositPropertyId,
        tenant,
        payment_date: normalizeDateInputValue(depositPaymentForm.paymentDate),
        amount: Number(depositPaymentForm.amount || 0),
        method: depositPaymentForm.method,
        payment_type: depositPaymentForm.paymentType || 'security',
        note: depositPaymentForm.note || null,
      })

    if (error) {
      setMessage(error.message)
      return
    }

    const amountNumber = Number(depositPaymentForm.amount || 0)
    const paymentType = depositPaymentForm.paymentType || 'security'
    const paidAfter = paymentType === 'pet'
      ? Number(selectedDepositSummary.petPaid || 0) + amountNumber
      : Number(selectedDepositSummary.securityPaid || 0) + amountNumber
    const requiredAmount = paymentType === 'pet'
      ? Number(depositDraft.petRequiredAmount || selectedDepositSummary.petRequiredAmount || 0)
      : Number(depositDraft.requiredAmount || selectedDepositSummary.requiredAmount || 0)
    const balanceAfter = Math.max(requiredAmount - paidAfter, 0)
    const tenantRecord = getTenantRecordForProperty(selectedDepositPropertyId, tenant)
    const contactOptions = getReceiptContactOptions(selectedDepositPropertyId)
    const receiptMessage = buildDepositReceiptMessage({
      property: selectedDepositProperty,
      tenantName: tenant,
      paymentDate: normalizeDateInputValue(depositPaymentForm.paymentDate),
      amount: amountNumber,
      method: depositPaymentForm.method,
      depositType: paymentType,
      requiredAmount,
      paidAfter,
      balanceAfter,
      dueDate: paymentType === 'pet'
        ? (depositDraft.petDueDate || selectedDepositRecord.petDueDate || depositDraft.dueDate || selectedDepositRecord.dueDate)
        : (depositDraft.dueDate || selectedDepositRecord.dueDate),
      note: depositPaymentForm.note || '',
    })
    setLastReceipt({
      type: depositPaymentForm.paymentType === 'pet' ? 'pet_deposit' : 'security_deposit',
      phone: tenantRecord?.phone || contactOptions[0]?.phone || '',
      contactOptions,
      tenantName: tenant,
      propertyId: selectedDepositPropertyId,
      message: receiptMessage,
    })

    setDepositPaymentForm({
      paymentDate: getTodayDateInput(),
      amount: '',
      method: depositPaymentForm.method || 'Cash',
      paymentType: depositPaymentForm.paymentType || 'security',
      note: '',
    })
    await loadData()
    setMessage(`${paymentType === 'pet' ? 'Pet deposit' : 'Security deposit'} payment saved. Receipt is ready to text.`)
  }

  async function deleteSecurityDepositPayment(paymentId) {
    if (!selectedDepositPropertyId) return

    const confirmed = window.confirm('Delete this security deposit payment?')
    if (!confirmed) return

    const { error } = await supabase
      .from('security_deposit_payments')
      .delete()
      .eq('id', paymentId)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadData()
    setMessage('Security deposit payment deleted.')
  }

  async function editSecurityDepositPayment(payment) {
    if (!selectedDepositPropertyId) return

    const amountInput = window.prompt('Edit deposit payment amount:', String(payment.amount || ''))
    if (amountInput === null) return

    const amountValue = Number(amountInput)
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setMessage('Please enter a valid deposit payment amount greater than zero.')
      return
    }

    const dateInput = window.prompt('Edit deposit payment date (YYYY-MM-DD):', normalizeDateInputValue(payment.paymentDate))
    if (dateInput === null) return

    const normalizedDate = normalizeDateInputValue(dateInput)
    if (!normalizedDate) {
      setMessage('Please enter a valid deposit payment date.')
      return
    }

    const methodInput = window.prompt('Edit deposit payment method:', payment.method || 'Cash')
    if (methodInput === null) return

    const noteInput = window.prompt('Edit deposit payment note:', payment.note || '')
    if (noteInput === null) return

    const { error } = await supabase
      .from('security_deposit_payments')
      .update({
        payment_date: normalizedDate,
        amount: amountValue,
        method: methodInput || 'Cash',
        note: noteInput || null,
      })
      .eq('id', payment.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadData()
    setMessage('Security deposit payment updated.')
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

    const postedMonth = monthKeyFromDate(editPaymentForm.paymentDate)
    const { data: updatedPayment, error } = await supabase
      .from('payments')
      .update({
        payment_date: editPaymentForm.paymentDate,
        amount: Number(editPaymentForm.amount || 0),
        method: editPaymentForm.method,
        note: editPaymentForm.note || null,
      })
      .eq('id', paymentId)
      .select('*')
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    if (updatedPayment) {
      setPayments((current) => current.map((item) => (item.id === paymentId ? updatedPayment : item)))
    }

    if (postedMonth) {
      setSelectedMonth(postedMonth)
    }

    cancelEditingPayment()
    await loadData()
    setMessage(`${editPaymentForm.method === 'Late Fee' ? 'Late fee' : 'Payment'} updated and posted to ${monthLabel(postedMonth || selectedMonth)}.`)
  }

  async function deletePayment(paymentId) {
    const confirmed = confirmDeleteWithPrompt(
      `Delete this payment?

This permanently removes the payment from the ledger.`
    )
    if (!confirmed) return

    setMessage('')

    const deletedPayment = payments.find((item) => item.id === paymentId) || null
    const { error } = await supabase.from('payments').delete().eq('id', paymentId)

    if (error) {
      setMessage(error.message)
      return
    }

    setPayments((current) => current.filter((item) => item.id !== paymentId))

    if (editingPaymentId === paymentId) cancelEditingPayment()

    if (deletedPayment?.payment_date) {
      const deletedMonth = monthKeyFromDate(deletedPayment.payment_date)
      if (deletedMonth) {
        setSelectedMonth(deletedMonth)
      }
    }

    await loadData()
    setMessage('Payment deleted and removed from the ledger.')
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

    let existing = monthlyOverrides.find(
      (item) => item.property_id === propertyId && item.month_key === selectedMonth
    ) || null

    if (!existing) {
      const { data: existingRow, error: lookupError } = await supabase
        .from('monthly_overrides')
        .select('id, property_id, month_key')
        .eq('property_id', propertyId)
        .eq('month_key', selectedMonth)
        .maybeSingle()

      if (lookupError) {
        setMessage(lookupError.message)
        return
      }

      existing = existingRow || null
    }

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

    if (existing?.id) {
      ;({ error } = await supabase.from('monthly_overrides').update(payload).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('monthly_overrides').insert(payload))

      if (error && String(error.message || '').includes('monthly_overrides_property_id_month_key_key')) {
        const { data: fallbackExisting, error: fallbackLookupError } = await supabase
          .from('monthly_overrides')
          .select('id')
          .eq('property_id', propertyId)
          .eq('month_key', selectedMonth)
          .maybeSingle()

        if (fallbackLookupError) {
          setMessage(fallbackLookupError.message)
          return
        }

        if (fallbackExisting?.id) {
          ;({ error } = await supabase.from('monthly_overrides').update(payload).eq('id', fallbackExisting.id))
        }
      }
    }

    if (error) {
      setMessage(error.message)
      return
    }

    cancelEditingOverride()
    await loadData()
    setMessage(`Override saved for ${monthLabel(selectedMonth)}.`)
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
  const reportDateRangeLabel = getReportDateRangeLabel(reportStartDate, reportEndDate)
  const generatedOnLabel = getGeneratedOnLabel()
  const nextMonthKey = useMemo(() => getNextMonthKey(selectedMonth), [selectedMonth])
  const logoSrc = useMemo(() => {
    if (typeof window === 'undefined') return '/logo.png'
    return `${window.location.origin}/logo.png?v=${logoRefreshKey}`
  }, [logoRefreshKey])
  const reportLogoSrc = embeddedReportLogoSrc || logoSrc

  function refreshLogos() {
    setLogoRefreshKey(Date.now())
  }

  const normalizedSearchQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery])

  const filteredCompanies = useMemo(() => {
    if (!normalizedSearchQuery) return companies

    return companies.filter((company) => {
      const companyName = company.company_name || company.name || ''
      return (
        matchesSearch(companyName, normalizedSearchQuery) ||
        matchesSearch(company.owner_email, normalizedSearchQuery)
      )
    })
  }, [companies, normalizedSearchQuery])

  const companyProperties = useMemo(() => {
    if (!selectedCompanyId) return []
    return properties.filter((property) => property.company_id === selectedCompanyId)
  }, [properties, selectedCompanyId])

  const activeCompanyProperties = useMemo(() => {
    return companyProperties.filter((property) => property.is_active !== false)
  }, [companyProperties])


  useEffect(() => {
    if (activeCompanyProperties.length === 0) return

    setLeaseForm((current) => {
      const selectedStillExists = activeCompanyProperties.some((property) => property.id === current.propertyId)
      if (selectedStillExists) return current

      const property = activeCompanyProperties[0]
      const rent = property?.monthly_rent ? String(property.monthly_rent) : ''
      const grossRent = rent ? String(Number(rent) + 50) : ''
      return {
        ...current,
        propertyId: property.id,
        propertyAddress: property.address || '',
        tenantNames: current.tenantNames || property.tenant || '',
        monthlyRent: current.monthlyRent || rent,
        grossRent: current.grossRent || grossRent,
        depositAmount: current.depositAmount || rent,
      }
    })
  }, [activeCompanyProperties])

  const visibleProperties = useMemo(() => {
    return showArchivedProperties ? companyProperties : activeCompanyProperties
  }, [companyProperties, activeCompanyProperties, showArchivedProperties])


  const filteredVisibleProperties = useMemo(() => {
    if (!normalizedSearchQuery) return visibleProperties

    return visibleProperties.filter((property) => {
      const propertyOverrides = monthlyOverrides.filter((item) => item.property_id === property.id)
      const tenants = [
        property.tenant,
        ...propertyOverrides.map((item) => item.tenant_override),
      ].filter(Boolean)

      return (
        matchesSearch(selectedCompanyName, normalizedSearchQuery) ||
        matchesSearch(property.address, normalizedSearchQuery) ||
        tenants.some((tenant) => matchesSearch(tenant, normalizedSearchQuery))
      )
    })
  }, [visibleProperties, monthlyOverrides, normalizedSearchQuery, selectedCompanyName])

  const notesProperty = useMemo(() => {
    return companyProperties.find((property) => property.id === selectedNotesPropertyId) || null
  }, [companyProperties, selectedNotesPropertyId])

  const selectedDepositProperty = useMemo(() => {
    return companyProperties.find((property) => property.id === selectedDepositPropertyId) || null
  }, [companyProperties, selectedDepositPropertyId])


  const selectedLeaseProperty = useMemo(() => {
    return companyProperties.find((property) => property.id === leaseForm.propertyId) || null
  }, [companyProperties, leaseForm.propertyId])

  const companyLeaseRecords = useMemo(() => {
    const propertyIds = new Set(companyProperties.map((property) => property.id))
    return leases.filter((lease) => propertyIds.has(lease.property_id))
  }, [leases, companyProperties])

  const selectedDepositTenant = useMemo(() => {
    if (!selectedDepositProperty) return ''
    const propertyOverrides = monthlyOverrides.filter((item) => item.property_id === selectedDepositProperty.id)
    return getTenantForDate(selectedDepositProperty, propertyOverrides, getTodayDateInput()) || ''
  }, [selectedDepositProperty, monthlyOverrides])

  const selectedDepositRecord = useMemo(() => {
    return buildSecurityDepositRecord(securityDeposits[securityDepositKey(selectedDepositPropertyId, selectedDepositTenant)])
  }, [securityDeposits, selectedDepositPropertyId, selectedDepositTenant])

  const selectedDepositSummary = useMemo(() => {
    const paymentsList = selectedDepositRecord.payments || []
    const securityPaid = paymentsList
      .filter((item) => (item.paymentType || 'security') !== 'pet')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const petPaid = paymentsList
      .filter((item) => (item.paymentType || 'security') === 'pet')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const totalPaid = securityPaid + petPaid
    const requiredAmount = Number(selectedDepositRecord.requiredAmount || 0)
    const petRequiredAmount = Number(selectedDepositRecord.petRequiredAmount || 0)
    const totalRequired = requiredAmount + petRequiredAmount
    const securityBalanceOwed = Math.max(requiredAmount - securityPaid, 0)
    const petBalanceOwed = Math.max(petRequiredAmount - petPaid, 0)
    const balanceOwed = securityBalanceOwed + petBalanceOwed
    const refundAmount = Number(selectedDepositRecord.refundAmount || 0)
    const deductionAmount = Number(selectedDepositRecord.deductionAmount || 0)
    return {
      totalPaid,
      securityPaid,
      petPaid,
      requiredAmount,
      petRequiredAmount,
      totalRequired,
      securityBalanceOwed,
      petBalanceOwed,
      balanceOwed,
      refundAmount,
      deductionAmount,
    }
  }, [selectedDepositRecord])

  const selectedLedgerDepositTenant = useMemo(() => {
    const reportProperty = companyProperties.find((property) => property.id === selectedReportPropertyId)
    if (!reportProperty) return ''
    const propertyOverrides = monthlyOverrides.filter((item) => item.property_id === reportProperty.id)
    return getTenantForDate(reportProperty, propertyOverrides, reportEndDate || getTodayDateInput()) || ''
  }, [companyProperties, monthlyOverrides, selectedReportPropertyId, reportEndDate])

  const selectedLedgerDepositRecord = useMemo(() => {
    return buildSecurityDepositRecord(securityDeposits[securityDepositKey(selectedReportPropertyId, selectedLedgerDepositTenant)])
  }, [securityDeposits, selectedReportPropertyId, selectedLedgerDepositTenant])

  const selectedLedgerDepositSummary = useMemo(() => {
    const paymentsList = selectedLedgerDepositRecord.payments || []
    const securityPaid = paymentsList
      .filter((item) => (item.paymentType || 'security') !== 'pet')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const petPaid = paymentsList
      .filter((item) => (item.paymentType || 'security') === 'pet')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const totalPaid = securityPaid + petPaid
    const requiredAmount = Number(selectedLedgerDepositRecord.requiredAmount || 0)
    const petRequiredAmount = Number(selectedLedgerDepositRecord.petRequiredAmount || 0)
    const totalRequired = requiredAmount + petRequiredAmount
    const balanceOwed = Math.max(requiredAmount - securityPaid, 0) + Math.max(petRequiredAmount - petPaid, 0)
    return {
      totalPaid,
      securityPaid,
      petPaid,
      requiredAmount,
      petRequiredAmount,
      totalRequired,
      balanceOwed,
      refundAmount: Number(selectedLedgerDepositRecord.refundAmount || 0),
      deductionAmount: Number(selectedLedgerDepositRecord.deductionAmount || 0),
    }
  }, [selectedLedgerDepositRecord])

  const notesPropertyTenant = useMemo(() => {
    if (!notesProperty) return ''
    const propertyOverrides = monthlyOverrides.filter((item) => item.property_id === notesProperty.id)
    return getTenantForDate(notesProperty, propertyOverrides, getTodayDateInput())
  }, [notesProperty, monthlyOverrides])

  useEffect(() => {
    if (companyProperties.length > 0) {
      const exists = companyProperties.find((p) => p.id === selectedReportPropertyId)
      if (!exists) setSelectedReportPropertyId(companyProperties[0].id)
    } else {
      setSelectedReportPropertyId('')
    }
  }, [companyProperties, selectedReportPropertyId])

  useEffect(() => {
    if (companyProperties.length === 0) {
      setSelectedNotesPropertyId('')
      setNotesDraft('')
      return
    }

    const stillExists = companyProperties.some((property) => property.id === selectedNotesPropertyId)
    if (!stillExists) {
      setSelectedNotesPropertyId(companyProperties[0].id)
    }
  }, [companyProperties, selectedNotesPropertyId])

  useEffect(() => {
    if (!selectedNotesPropertyId) {
      setNotesDraft('')
      return
    }

    setNotesDraft(propertyNotes[selectedNotesPropertyId]?.text || '')
  }, [selectedNotesPropertyId, propertyNotes])

  useEffect(() => {
    if (companyProperties.length === 0) {
      setSelectedDepositPropertyId('')
      return
    }

    const stillExists = companyProperties.some((property) => property.id === selectedDepositPropertyId)
    if (!stillExists) {
      setSelectedDepositPropertyId(companyProperties[0].id)
    }
  }, [companyProperties, selectedDepositPropertyId])

  const companyPropertyIds = useMemo(() => companyProperties.map((property) => property.id), [companyProperties])

  useEffect(() => {
    if (activeCompanyProperties.length === 0) {
      setPaymentForm((current) => ({
        ...current,
        propertyId: '',
      }))
      return
    }

    const propertyStillExists = activeCompanyProperties.some((property) => property.id === paymentForm.propertyId)

    if (!propertyStillExists) {
      setPaymentForm((current) => ({
        ...current,
        propertyId: activeCompanyProperties[0].id,
      }))
    }
  }, [activeCompanyProperties, paymentForm.propertyId])

  const companyPayments = useMemo(() => {
    return payments.filter((payment) => companyPropertyIds.includes(payment.property_id))
  }, [payments, companyPropertyIds])

  const companyOverrides = useMemo(() => {
    return monthlyOverrides.filter((override) => companyPropertyIds.includes(override.property_id))
  }, [monthlyOverrides, companyPropertyIds])

  const monthlyPayments = useMemo(() => {
    return companyPayments.filter((payment) => String(payment.payment_date).startsWith(selectedMonth))
  }, [companyPayments, selectedMonth])


  const filteredMonthlyPayments = useMemo(() => {
    if (!normalizedSearchQuery) return monthlyPayments

    return monthlyPayments.filter((payment) => {
      const property = companyProperties.find((item) => item.id === payment.property_id)
      const tenantName = property ? getTenantForDate(property, companyOverrides.filter((item) => item.property_id === property.id), payment.payment_date) : ''

      return (
        matchesSearch(selectedCompanyName, normalizedSearchQuery) ||
        matchesSearch(property?.address, normalizedSearchQuery) ||
        matchesSearch(tenantName, normalizedSearchQuery) ||
        matchesSearch(payment.method, normalizedSearchQuery) ||
        matchesSearch(payment.note, normalizedSearchQuery)
      )
    })
  }, [monthlyPayments, companyProperties, companyOverrides, normalizedSearchQuery, selectedCompanyName])

  function buildPropertyLedger(property, monthsToInclude) {
    const propertyOverrides = companyOverrides.filter((item) => item.property_id === property.id)
    const propertyPayments = companyPayments
      .filter((payment) => payment.property_id === property.id)
      .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)))

    let runningBalance = 0
    let previousEffectiveTenant = ''
    let previousMonthWasOccupied = false
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
      const hasMoveInThisMonth = Boolean(
        override?.move_in_date && monthKeyFromDate(override.move_in_date) === month
      )
      const startsFreshTenancy = Boolean(
        hasMoveInThisMonth &&
        effectiveTenant &&
        (effectiveTenant !== previousEffectiveTenant || !previousMonthWasOccupied)
      )

      if (startsFreshTenancy) {
        runningBalance = 0
      }

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
        const chargeDate = getChargeDateForMonth(month, property.due_day, occupancy.firstOccupiedDate)
        runningBalance += effectiveRent
        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: effectiveTenant,
          month,
          date: chargeDate,
          type: 'charge',
          description: occupancy.occupiedDays < 28 ? 'Rent charge (partial occupancy month)' : 'Rent charge',
          amount: effectiveRent,
          note: override?.notes || '',
          occupancyStart: occupancy.firstOccupiedDate,
          occupancyEnd: occupancy.lastOccupiedDate,
          runningBalance,
        })
      }

      const manualLateFeeTotal = monthPaymentsForProperty
        .filter((payment) => isManualLateFeeEntry(payment))
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

      monthPaymentsForProperty.forEach((payment) => {
        const isLateFeeEntry = isManualLateFeeEntry(payment)

        if (isLateFeeEntry) {
          runningBalance += Number(payment.amount || 0)
        } else {
          runningBalance -= Number(payment.amount || 0)
        }

        entries.push({
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: getTenantForDate(property, propertyOverrides, payment.payment_date) || effectiveTenant,
          month,
          date: payment.payment_date,
          type: isLateFeeEntry ? 'late_fee' : 'payment',
          description: isLateFeeEntry ? 'Late fee' : `Payment - ${payment.method || 'Method not listed'}`,
          amount: isLateFeeEntry ? Number(payment.amount || 0) : -Number(payment.amount || 0),
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
        lateFee: manualLateFeeTotal,
        totalPaid: monthPaymentsForProperty.filter((payment) => !isManualLateFeeEntry(payment)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        endingBalance: runningBalance,
        notes: override?.notes || '',
        currentOverride: override || null,
        moveInDate: override?.move_in_date || occupancy.firstOccupiedDate || '',
        moveOutDate: override?.move_out_date || '',
      })

      previousEffectiveTenant = effectiveTenant
      previousMonthWasOccupied = occupancy.isOccupied
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

  const filteredLedgerRows = useMemo(() => {
    if (!normalizedSearchQuery) return ledgerRows

    return ledgerRows.filter((row) => (
      matchesSearch(selectedCompanyName, normalizedSearchQuery) ||
      matchesSearch(row.address, normalizedSearchQuery) ||
      matchesSearch(row.effectiveTenant, normalizedSearchQuery)
    ))
  }, [ledgerRows, normalizedSearchQuery, selectedCompanyName])

  const selectedReportProperty = companyProperties.find((p) => p.id === selectedReportPropertyId) || null

  const selectedPropertyLedger = useMemo(() => {
    if (!selectedReportPropertyId) return null
    return propertyLedgerMap[selectedReportPropertyId] || null
  }, [selectedReportPropertyId, propertyLedgerMap])

  const selectedPropertyLedgerRows = useMemo(() => {
    if (!selectedPropertyLedger) return []

    const entriesUpToEndDate = selectedPropertyLedger.entries.filter((entry) => {
      if (!reportEndDate) return true
      return String(entry.date || '').slice(0, 10) <= reportEndDate
    })

    if (!reportStartDate) {
      return entriesUpToEndDate
    }

    const latestBalanceForward = [...entriesUpToEndDate]
      .filter((entry) => entry.type === 'balance_forward' && String(entry.date || '').slice(0, 10) <= reportStartDate)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .pop()

    const rangedRows = entriesUpToEndDate.filter((entry) => {
      if (entry.type === 'balance_forward') return false
      return isWithinDateRange(entry.date, reportStartDate, reportEndDate)
    })

    if (!latestBalanceForward) {
      return rangedRows
    }

    return [latestBalanceForward, ...rangedRows]
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
  const filteredPropertyOptions = useMemo(() => {
    if (!normalizedSearchQuery) return companyProperties

    return companyProperties.filter((property) => {
      const propertyOverrides = companyOverrides.filter((item) => item.property_id === property.id)
      const tenants = [property.tenant, ...propertyOverrides.map((item) => item.tenant_override)].filter(Boolean)
      return (
        matchesSearch(property.address, normalizedSearchQuery) ||
        tenants.some((tenant) => matchesSearch(tenant, normalizedSearchQuery))
      )
    })
  }, [companyProperties, companyOverrides, normalizedSearchQuery])

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

    const entriesUpToEndDate = ledger.entries.filter((entry) => {
      if (!reportEndDate) return true
      return String(entry.date || '').slice(0, 10) <= reportEndDate
    })

    if (!reportStartDate) {
      return entriesUpToEndDate
    }

    const latestBalanceForward = [...entriesUpToEndDate]
      .filter((entry) => entry.type === 'balance_forward' && String(entry.date || '').slice(0, 10) <= reportStartDate)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .pop()

    const rangedRows = entriesUpToEndDate.filter((entry) => {
      if (entry.type === 'balance_forward') return false
      return isWithinDateRange(entry.date, reportStartDate, reportEndDate)
    })

    if (!latestBalanceForward) {
      return rangedRows
    }

    return [latestBalanceForward, ...rangedRows]
  }, [selectedReportProperty, propertyLedgerMap, reportStartDate, reportEndDate])

  const selectedPropertyStatementTenant = useMemo(() => {
    return selectedPropertyStatementRows.find((entry) => entry.tenantName)?.tenantName || ''
  }, [selectedPropertyStatementRows])

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

  const companyAlerts = useMemo(() => {
    const upcomingMoveOutDays = 30
    const today = getTodayDateInput()
    const upcomingCutoff = addDays(today, upcomingMoveOutDays)
    const items = []

    ledgerRows.forEach((row) => {
      if (Number(row.balanceRemaining || 0) > 0) {
        items.push({
          id: `balance-${row.id}`,
          category: 'Unpaid balance',
          severity: 'high',
          propertyId: row.id,
          title: row.address,
          detail: `${currency(row.balanceRemaining)} still due${row.effectiveTenant ? ` for ${row.effectiveTenant}` : ''}.`,
        })
      }

      if (Number(row.totalPaid || 0) > 0 && Number(row.balanceRemaining || 0) > 0) {
        items.push({
          id: `partial-${row.id}`,
          category: 'Partial payment',
          severity: 'medium',
          propertyId: row.id,
          title: row.address,
          detail: `${currency(row.totalPaid)} collected with ${currency(row.balanceRemaining)} still remaining.`,
        })
      }

      if (!row.effectiveTenant) {
        items.push({
          id: `vacant-${row.id}`,
          category: 'Vacant property',
          severity: 'medium',
          propertyId: row.id,
          title: row.address,
          detail: `No active tenant found for ${monthLabel(selectedMonth)}.`,
        })
      }
    })

    companyOverrides.forEach((override) => {
      if (!override.move_out_date) return

      const moveOutDate = String(override.move_out_date).slice(0, 10)
      if (moveOutDate < today || moveOutDate > upcomingCutoff) return

      const property = companyProperties.find((item) => item.id === override.property_id)
      const tenantName = override.tenant_override || property?.tenant || ''

      items.push({
        id: `moveout-${override.id || `${override.property_id}-${moveOutDate}`}`,
        category: 'Upcoming move-out',
        severity: 'low',
        propertyId: override.property_id,
        title: property?.address || 'Property',
        detail: `${tenantName ? `${tenantName} ` : ''}has a move-out dated ${formatDate(moveOutDate)}.`,
      })
    })

    if (!normalizedSearchQuery) return items

    return items.filter((item) => (
      matchesSearch(selectedCompanyName, normalizedSearchQuery) ||
      matchesSearch(item.title, normalizedSearchQuery) ||
      matchesSearch(item.detail, normalizedSearchQuery) ||
      matchesSearch(item.category, normalizedSearchQuery)
    ))
  }, [ledgerRows, companyOverrides, companyProperties, selectedMonth, normalizedSearchQuery, selectedCompanyName])

  const highAlertCount = companyAlerts.filter((item) => item.severity === 'high').length
  const mediumAlertCount = companyAlerts.filter((item) => item.severity === 'medium').length
  const lowAlertCount = companyAlerts.filter((item) => item.severity === 'low').length
  const notesCount = Object.values(propertyNotes).filter((item) => item?.text).length

  const bankDepositReportRows = useMemo(() => {
    const selectedYear = String(selectedMonth || getCurrentMonthKey()).slice(0, 4)

    return companyPayments
      .filter((payment) => String(payment.method || '').toLowerCase() === 'bank deposit')
      .filter((payment) => {
        const paymentDate = String(payment.payment_date || '')
        if (selectedBankDepositPeriod === 'year') return paymentDate.startsWith(selectedYear)
        return paymentDate.startsWith(selectedMonth)
      })
      .filter((payment) => !selectedBankDepositPropertyId || payment.property_id === selectedBankDepositPropertyId)
      .map((payment) => {
        const property = companyProperties.find((item) => item.id === payment.property_id) || null
        return {
          ...payment,
          propertyAddress: property?.address || 'Unknown property',
        }
      })
      .sort((a, b) => {
        const dateCompare = String(a.payment_date || '').localeCompare(String(b.payment_date || ''))
        if (dateCompare !== 0) return dateCompare
        return String(a.propertyAddress || '').localeCompare(String(b.propertyAddress || ''))
      })
  }, [companyPayments, companyProperties, selectedBankDepositPeriod, selectedBankDepositPropertyId, selectedMonth])

  const bankDepositReportTotal = bankDepositReportRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const bankDepositReportTitle = selectedBankDepositPeriod === 'year'
    ? `Bank Deposit Reconciliation Report - ${String(selectedMonth || getCurrentMonthKey()).slice(0, 4)}`
    : `Bank Deposit Reconciliation Report - ${formatMonthYear(selectedMonth)}`
  const bankDepositReportPropertyLabel = selectedBankDepositPropertyId
    ? companyProperties.find((item) => item.id === selectedBankDepositPropertyId)?.address || 'Selected property'
    : 'All properties'

  const totalProperties = filteredLedgerRows.length
  const totalMonthlyRent = filteredLedgerRows.reduce((sum, row) => sum + Number(row.effectiveRent || 0), 0)
  const totalCollected = filteredLedgerRows.reduce((sum, row) => sum + Number(row.totalPaid || 0), 0)
  const totalOutstanding = filteredLedgerRows.reduce((sum, row) => sum + Number(row.balanceRemaining || 0), 0)
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
      ...filteredLedgerRows.map((row) =>
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

  function getManagementInvoiceNumber() {
    const compactMonth = selectedMonth.replace('-', '')
    const slug = (selectedCompanyName || 'company')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18)
    return `INV-${compactMonth}-${slug || 'company'}`
  }

  function emailManagementInvoice() {
    if (!selectedCompanyEmail) {
      setMessage('This company does not have an owner email saved yet.')
      return
    }

    const subject = `${selectedCompanyName} - Property Management Fee Invoice - ${formatMonthYear(selectedMonth)}`
    const lines = [
      'Open Door Support',
      'Property Management System',
      '',
      'Property Management Fee Invoice',
      formatMonthYear(selectedMonth),
      '',
      `Billed To: ${selectedCompanyName}`,
      `Invoice #: ${getManagementInvoiceNumber()}`,
      `Generated: ${generatedOnLabel}`,
      '',
      `Collected Rent: ${currency(totalCollected)}`,
      `Management Fee Rate: 10%`,
      `Amount Due: ${currency(managementFeeCollected)}`,
      '',
      'Thank you for your business.',
    ]
    window.location.href = `mailto:${selectedCompanyEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
  }


  function buildPrintableHtml(sectionHtml, title) {
    return `
      <html>
        <head>
          <title>${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #261525; background: #ffffff; }
            .print-shell { max-width: 1100px; margin: 0 auto; }
            .reportBrandShell { background: linear-gradient(135deg, #220821 0%, #4a1546 58%, #5a1a54 100%) !important; border-top: 4px solid #d89a2b !important; border-radius: 0 !important; box-shadow: none !important; }
            .reportBrandTop { display: flex !important; align-items: center !important; gap: 16px !important; flex-wrap: wrap !important; }
            .reportBrandLogoWrap { background: #f5ebdf !important; border: 1px solid rgba(231, 212, 187, 0.45) !important; border-radius: 8px !important; width: 180px !important; height: 64px !important; padding: 8px 14px !important; display: flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; overflow: hidden !important; }
            .reportBrandLogo { width: 100% !important; max-width: 150px !important; object-fit: contain !important; display: block !important; }
            .reportBrandTitle { color: #f5ebdf !important; font-family: Georgia, 'Times New Roman', serif !important; font-size: 28px !important; font-weight: 700 !important; letter-spacing: -0.02em !important; }
            .reportBrandSubtitle { color: #e7d4bb !important; font-size: 12px !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-weight: 700 !important; margin-top: 6px !important; }
            .report-print-header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #d9cfc0; }
            .report-print-company { font-size: 18px; font-weight: 700; margin-bottom: 6px; color: #2f102d; }
            .report-print-title { font-size: 24px; font-weight: 700; margin-bottom: 6px; color: #2f102d; }
            .report-print-meta { font-size: 14px; color: #4b5563; margin-bottom: 4px; }
            .report-print-footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #d9cfc0; font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
            .notes-box { margin-top: 16px; background: #fbf7f1; border: 1px solid #e8dccb; border-radius: 8px; padding: 12px 14px; font-size: 14px; color: #4b5563; }
            .report-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 16px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #d9cfc0; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #fbf7f1; color: #9a6d2f; text-transform: uppercase; letter-spacing: .04em; font-size: 12px; }
            .lease-package { max-width: 8.5in; margin: 0 auto; color: #111827; font-family: 'Times New Roman', Times, serif; font-size: 11px; line-height: 1.22; }
            .lease-page { width: 8.5in; height: 11in; min-height: 11in; padding: 0.26in 0.48in 0.34in; box-sizing: border-box; page-break-after: always; break-after: page; background: #fff; display: flex; flex-direction: column; position: relative; overflow: hidden; }
            .lease-page:last-child { page-break-after: auto; break-after: auto; }
            .lease-title { text-align: center; font-size: 17px; font-weight: 700; letter-spacing: .04em; margin: 0 0 8px; }
            .lease-company-line { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #111827; font-weight: 700; font-size: 11px; flex: 0 0 auto; }
            .lease-company-line span:first-child { font-size: 16.5px; letter-spacing: .01em; }
            .lease-company-line span:last-child { font-size: 10px; }
            .lease-line { margin: 0 0 4px; }
            .lease-section-title { font-weight: 700; font-style: italic; text-transform: uppercase; text-decoration: underline; margin-right: 6px; }
            .lease-fill { font-weight: 700; text-decoration: underline; }
            .lease-page-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
            .lease-page-footer { flex: 0 0 auto; margin-top: auto; padding-top: 0.1in; }
            .lease-page-number { position: absolute; right: 0.48in; bottom: 0.12in; font-size: 8px; color: #111827; }
            .lease-initial-row, .lease-signature-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 22px; text-align: center; font-size: 9px; page-break-inside: avoid; break-inside: avoid; }
            .lease-page-footer .lease-initial-row { margin-top: 0; margin-bottom: 0.11in; font-size: 8px; line-height: 1.05; }
            .lease-signature-row { grid-template-columns: 1fr 1fr; margin-top: 34px; }
            .lease-sign-line { border-top: 1px solid #111827; padding-top: 4px; min-height: 18px; }
            .lease-initial-row .lease-sign-line { width: 100%; margin: 0 auto; border-top: 0; padding-top: 8px; position: relative; white-space: nowrap; }
            .lease-initial-row .lease-sign-line::before { content: ''; position: absolute; top: 0; left: 50%; width: 0.45in; transform: translateX(-50%); border-top: 1px solid #111827; }
            .lease-initial-row .lease-sign-line.blank::before { border-top-color: transparent; }
            .lease-sign-line.blank { border-top-color: transparent; }
            .lease-rules-title { text-align: center; font-size: 17px; font-weight: 700; margin: 8px 0 12px; }
            .lease-rules-list li { margin-bottom: 4px; }
            .lease-addendum-title { text-align: center; font-size: 16px; font-weight: 700; margin: 10px 0 14px; text-transform: uppercase; }
            .pet-provision-page .lease-addendum-title { margin: 0.55in 0 0.35in; font-size: 19px; letter-spacing: .03em; }
            .pet-provision-page p { margin-bottom: 16px; }
            .lease-small-note { font-size: 10px; color: #374151; }
            .lease-formal-page { font-size: 12.55px; line-height: 1.11; }
            .lease-formal-page.lease-tight-page { font-size: 11.9px; line-height: 1.065; }
            .lease-addendum-page { font-size: 12.15px; line-height: 1.21; }
            .pet-provision-page { font-size: 15px; line-height: 1.4; }
            .lease-page-meta { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #111827; padding-bottom: 4px; margin-bottom: 7px; }
            .lease-occupants-line { min-height: 20px; margin: 5px 0 7px 28px; }
            .lease-warning { text-align: center; font-weight: 700; margin: 18px 0 20px; padding: 10px 0; line-height: 1.35; }
            .lease-repair-call { margin-top: 0.72in !important; font-size: 13px; font-weight: 700; }
            .lease-initial-row.compact, .lease-signature-row.compact { margin-top: 24px; margin-bottom: 14px; font-size: 8px; }
            .lease-signature-row.compact .lease-sign-line::before { width: 0.45in; }
            .lease-rules-list { padding-left: 20px; margin-top: 8px; }
            .lease-page p { orphans: 2; widows: 2; }
            @page { size: letter; margin: 0; }
            @media print {
              body { padding: 0; }
              .print-shell { max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-shell">
            ${sectionHtml}
          </div>
        </body>
      </html>
    `
  }

  function printSection(sectionRef, title, mode = 'print') {
    const sectionHtml = sectionRef?.current?.innerHTML

    if (!sectionHtml) {
      setMessage(`Nothing to print for ${title}.`)
      return
    }

    const printableHtml = buildPrintableHtml(sectionHtml, title)

    if (isMobileViewport()) {
      const originalTitle = document.title
      const originalBody = document.body.innerHTML

      document.title = title
      document.body.innerHTML = printableHtml

      setTimeout(() => {
        try {
          window.print()
          setMessage(mode === 'download'
            ? 'Choose Save as PDF in your print dialog to download the report as a PDF.'
            : '')
        } catch (error) {
          console.error('Mobile print failed.', error)
          setMessage('There was a problem printing the page.')
        }

        setTimeout(() => {
          document.title = originalTitle
          document.body.innerHTML = originalBody
          window.location.reload()
        }, 500)
      }, 300)

      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(printableHtml)
    doc.close()

    const finish = () => {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe)
        } catch (error) {
          console.error('Unable to remove print frame.', error)
        }
        refreshLogos()
      }, 800)
    }

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
        setMessage(mode === 'download'
          ? 'Choose Save as PDF in your print dialog to download the report as a PDF.'
          : '')
      } catch (error) {
        console.error('Unable to open print dialog.', error)
        setMessage('There was a problem opening the print dialog on this device.')
      }
      finish()
    }
  }

  function saveSectionAsPdf(sectionRef, title) {
    printSection(sectionRef, title, 'download')
  }

  function updateLeaseForm(patch) {
    setLeaseForm((current) => ({
      ...current,
      ...patch,
    }))
  }

  function handleLeasePropertyChange(propertyId) {
    const property = companyProperties.find((item) => item.id === propertyId)
    const rent = property?.monthly_rent ? String(property.monthly_rent) : ''
    updateLeaseForm({
      propertyId,
      propertyAddress: property?.address || '',
      tenantNames: property?.tenant || leaseForm.tenantNames,
      monthlyRent: rent || leaseForm.monthlyRent,
      grossRent: rent ? String(Number(rent) + 50) : leaseForm.grossRent,
      depositAmount: rent || leaseForm.depositAmount,
    })
  }

  function handleLeaseStartDateChange(value) {
    const startDate = normalizeDateInputValue(value)
    const monthKey = monthKeyFromDate(startDate) || getCurrentMonthKey()
    updateLeaseForm({
      leaseStartDate: startDate,
      moveInDate: startDate,
      lastDayFirstMonth: endOfMonth(monthKey),
    })
  }

  function printLeasePackage() {
    const title = `${getLeaseFileName(leaseForm)}.pdf`
    printSection(leasePreviewRef, title, 'download')
  }

  function getLeaseTenantContacts() {
    return [
      {
        fullName: leaseForm.tenantNames || '',
        phone: leaseForm.tenantPhone || '',
        email: leaseForm.tenantEmail || '',
      },
      {
        fullName: leaseForm.tenant2Name || '',
        phone: leaseForm.tenant2Phone || '',
        email: leaseForm.tenant2Email || '',
      },
    ].filter((contact) => String(contact.fullName || '').trim())
  }

  function getLeaseTenantNamesForAgreement() {
    const names = getLeaseTenantContacts().map((contact) => contact.fullName.trim()).filter(Boolean)
    return names.length > 0 ? names.join(' and ') : leaseForm.tenantNames || ''
  }

  function getReceiptContactOptions(propertyId) {
    return tenants
      .filter((tenant) => tenant.property_id === propertyId && tenant.status !== 'archived' && tenant.phone)
      .map((tenant) => ({ name: tenant.full_name, phone: tenant.phone }))
  }

  function buildLeasePayload(status = 'draft') {
    const rent = leaseForm.monthlyRent === '' ? null : Number(leaseForm.monthlyRent || 0)
    const grossRent = leaseForm.grossRent === '' ? null : Number(leaseForm.grossRent || 0)
    const proratedRent = leaseForm.proratedRent === '' ? null : Number(leaseForm.proratedRent || 0)
    const depositAmount = leaseForm.depositAmount === '' ? null : Number(leaseForm.depositAmount || 0)
    const petDepositAmount = leaseForm.petDepositAmount === '' ? null : Number(leaseForm.petDepositAmount || 0)

    return {
      company_id: selectedCompanyId,
      property_id: leaseForm.propertyId || null,
      tenant_names: getLeaseTenantNamesForAgreement() || null,
      tenant_phone: leaseForm.tenantPhone || null,
      tenant_email: leaseForm.tenantEmail || null,
      occupants: leaseForm.occupants || null,
      lease_date: normalizeDateInputValue(leaseForm.leaseDate) || null,
      lease_start_date: normalizeDateInputValue(leaseForm.leaseStartDate) || null,
      lease_end_date: normalizeDateInputValue(leaseForm.leaseEndDate) || null,
      term_months: leaseForm.termMonths === '' ? null : Number(leaseForm.termMonths || 0),
      property_address: leaseForm.propertyAddress || selectedLeaseProperty?.address || null,
      property_state: leaseForm.propertyState || null,
      property_zip: leaseForm.propertyZip || null,
      monthly_rent: rent,
      gross_rent: grossRent,
      prorated_rent: proratedRent,
      last_day_first_month: normalizeDateInputValue(leaseForm.lastDayFirstMonth) || null,
      deposit_amount: depositAmount,
      has_pets: leaseForm.hasPets === 'yes',
      number_of_pets: leaseForm.numberOfPets || null,
      pet_names: leaseForm.petNames || null,
      pet_deposit_amount: petDepositAmount,
      property_manager_name: leaseForm.propertyManagerName || null,
      property_manager_phone: leaseForm.propertyManagerPhone || null,
      generated_pdf_file_name: `${getLeaseFileName(leaseForm)}.pdf`,
      status,
    }
  }

  function getTenantRecordForProperty(propertyId, tenantName = '') {
    const normalizedTenant = normalizeSearchText(tenantName)
    const propertyTenants = tenants.filter((tenant) => tenant.property_id === propertyId && tenant.status !== 'archived')
    if (normalizedTenant) {
      const exact = propertyTenants.find((tenant) => normalizeSearchText(tenant.full_name) === normalizedTenant)
      if (exact) return exact
      const partial = propertyTenants.find((tenant) => normalizeSearchText(tenant.full_name).includes(normalizedTenant) || normalizedTenant.includes(normalizeSearchText(tenant.full_name)))
      if (partial) return partial
    }
    return propertyTenants[0] || null
  }

  function normalizePhoneForSms(phone) {
    return String(phone || '').replace(/[^0-9+]/g, '')
  }

  function openTextReceipt(receipt = lastReceipt, phoneOverride = '') {
    if (!receipt?.message) {
      setMessage('No receipt message is ready yet.')
      return
    }

    const smsPhone = normalizePhoneForSms(phoneOverride || receipt.phone || '')
    const body = encodeURIComponent(receipt.message)

    if (smsPhone) {
      window.location.href = `sms:${smsPhone}?&body=${body}`
      return
    }

    if (navigator.share) {
      navigator.share({ text: receipt.message }).catch(() => {})
      return
    }

    navigator.clipboard?.writeText(receipt.message)
    setMessage('Receipt copied. No tenant phone number is saved yet, so you can paste it into a text manually.')
  }

  function copyReceipt(receipt = lastReceipt) {
    if (!receipt?.message) return
    navigator.clipboard?.writeText(receipt.message)
    setMessage('Receipt copied to clipboard.')
  }

  function buildRentReceiptMessage({ property, tenantName, paymentDate, amount, method, entryType, note }) {
    const postedMonth = monthKeyFromDate(paymentDate)
    const ledger = propertyLedgerMap[property?.id]
    const currentMonthSummary = ledger?.monthlySummaries?.find((item) => item.month === postedMonth)
    const currentBalance = Number(currentMonthSummary?.endingBalance || 0)
    const amountNumber = Number(amount || 0)
    const balanceAfter = entryType === 'late_fee' ? currentBalance + amountNumber : currentBalance - amountNumber
    const balanceLine = balanceAfter > 0
      ? `Remaining balance: ${currency(balanceAfter)}`
      : `Balance: ${currency(Math.max(balanceAfter, 0))}`
    const noteLine = note ? `\nNote: ${note}` : ''

    const receiptTitle = entryType === 'late_fee' ? 'Late Fee Receipt' : 'Rent Payment Receipt'
    return `${receiptTitle}\n\nTenant: ${tenantName || 'Tenant'}\nProperty: ${property?.address || 'Property'}\nDate received: ${formatDate(paymentDate)}\nAmount received: ${currency(amountNumber)}\nPayment method: ${method || 'Payment'}\n${balanceLine}${noteLine}\n\nThank you,\n${selectedCompanyName}`
  }

  function buildDepositReceiptMessage({ property, tenantName, paymentDate, amount, method, depositType = 'security', requiredAmount, paidAfter, balanceAfter, dueDate, note }) {
    const isPetDeposit = depositType === 'pet'
    const receiptTitle = isPetDeposit ? 'Pet Deposit Receipt' : 'Security Deposit Receipt'
    const label = isPetDeposit ? 'Pet deposit' : 'Security deposit'
    const dueLine = dueDate ? `\n${label} due date: ${formatDate(dueDate)}` : ''
    const noteLine = note ? `\nNote: ${note}` : ''
    return `${receiptTitle}\n\nTenant: ${tenantName || 'Tenant'}\nProperty: ${property?.address || 'Property'}\nDate received: ${formatDate(paymentDate)}\nAmount received: ${currency(amount)}\nPayment method: ${method || 'Payment'}\n\n${label} required: ${currency(requiredAmount)}\nTotal ${label.toLowerCase()} paid: ${currency(paidAfter)}\n${label} balance remaining: ${currency(Math.max(balanceAfter, 0))}${dueLine}${noteLine}\n\nThank you,\n${selectedCompanyName}`
  }

  async function saveTenantProfileFromLease(leaseRecord = null) {
    if (!selectedCompanyId || !leaseForm.propertyId) return null

    const contacts = getLeaseTenantContacts()
    if (contacts.length === 0) return null

    const commonNotes = leaseForm.tenantContactNotes?.trim() || null
    const savedTenants = []

    for (const contact of contacts) {
      const fullName = String(contact.fullName || '').trim()
      if (!fullName) continue

      const payload = {
        company_id: selectedCompanyId,
        property_id: leaseForm.propertyId,
        lease_id: leaseRecord?.id || null,
        full_name: fullName,
        phone: contact.phone || null,
        email: contact.email || null,
        move_in_date: normalizeDateInputValue(leaseForm.leaseStartDate) || null,
        move_out_date: null,
        status: 'active',
        notes: commonNotes,
      }

      const { data, error } = await supabase
        .from('tenants')
        .upsert(payload, { onConflict: 'property_id,full_name' })
        .select('*')
        .single()

      if (error) {
        console.error('Tenant profile save failed.', error)
        continue
      }

      if (data) savedTenants.push(data)
    }

    if (savedTenants.length > 0) {
      setTenants((current) => {
        const savedIds = new Set(savedTenants.map((item) => item.id))
        return [...savedTenants, ...current.filter((item) => !savedIds.has(item.id))]
      })
    }

    return savedTenants[0] || null
  }


  function getOnboardingChargeInfo(leaseRecord = null) {
    const source = leaseRecord || {}
    const propertyId = source.property_id || leaseForm.propertyId || ''
    const tenantNames = source.tenant_names || getLeaseTenantNamesForAgreement() || leaseForm.tenantNames || ''
    const leaseStartDate = normalizeDateInputValue(source.lease_start_date || leaseForm.leaseStartDate || leaseForm.moveInDate)
    const monthKey = monthKeyFromDate(leaseStartDate)
    const proratedRentRaw = source.prorated_rent ?? leaseForm.proratedRent
    const proratedRent = Number(proratedRentRaw || 0)
    const paidThroughDate = normalizeDateInputValue(source.last_day_first_month || leaseForm.lastDayFirstMonth)

    return {
      propertyId,
      tenantNames,
      leaseStartDate,
      monthKey,
      proratedRent,
      paidThroughDate,
    }
  }

  function hasPostedOnboardingCharge(leaseRecord = null) {
    const info = getOnboardingChargeInfo(leaseRecord)
    if (!info.propertyId || !info.monthKey || !info.proratedRent || info.proratedRent <= 0) return false

    const existing = monthlyOverrides.find((item) => item.property_id === info.propertyId && item.month_key === info.monthKey)
    if (!existing) return false

    const existingRent = Number(existing.override_rent || 0)
    const notes = String(existing.notes || '').toLowerCase()
    return Math.abs(existingRent - info.proratedRent) < 0.01 && notes.includes('lease onboarding prorated rent')
  }

  function getOnboardingDepositInfo(leaseRecord = null, overrides = {}) {
    const propertyId = leaseRecord?.property_id || leaseForm.propertyId || ''
    const tenantNames = leaseRecord?.tenant_names || getLeaseTenantNamesForAgreement() || leaseForm.tenantNames || ''
    const existingRecord = securityDeposits[securityDepositKey(propertyId, tenantNames)] || null

    const leaseSecurityValue = leaseRecord?.deposit_amount
    const leasePetValue = leaseRecord?.pet_deposit_amount
    const formSecurityValue = leaseForm.depositAmount
    const formPetValue = leaseForm.petDepositAmount
    const existingSecurityValue = existingRecord?.requiredAmount ?? existingRecord?.required_amount
    const existingPetValue = existingRecord?.petRequiredAmount ?? existingRecord?.pet_required_amount

    const securityDeposit = Number(
      overrides.securityDeposit ??
      (leaseSecurityValue !== null && leaseSecurityValue !== undefined && leaseSecurityValue !== '' ? leaseSecurityValue : undefined) ??
      (formSecurityValue !== null && formSecurityValue !== undefined && formSecurityValue !== '' ? formSecurityValue : undefined) ??
      existingSecurityValue ??
      0
    )
    const petDeposit = Number(
      overrides.petDeposit ??
      (leasePetValue !== null && leasePetValue !== undefined && leasePetValue !== '' ? leasePetValue : undefined) ??
      (formPetValue !== null && formPetValue !== undefined && formPetValue !== '' ? formPetValue : undefined) ??
      existingPetValue ??
      0
    )
    const dueDate = normalizeDateInputValue(
      overrides.dueDate ||
      leaseRecord?.lease_start_date ||
      leaseForm.leaseStartDate ||
      leaseForm.moveInDate ||
      existingRecord?.dueDate ||
      existingRecord?.due_date
    ) || getTodayDateInput()

    return {
      propertyId,
      tenantNames,
      securityDeposit: Number.isFinite(securityDeposit) ? securityDeposit : 0,
      petDeposit: Number.isFinite(petDeposit) ? petDeposit : 0,
      dueDate,
    }
  }


  async function applyLeaseTenantSetup(leaseRecord = null, infoOverride = null) {
    const info = infoOverride || getOnboardingChargeInfo(leaseRecord)

    if (!info.propertyId || !info.tenantNames || !info.leaseStartDate || !info.monthKey) {
      return { posted: false, reason: 'missing_property_tenant_or_date' }
    }

    const property = companyProperties.find((item) => item.id === info.propertyId) || activeCompanyProperties.find((item) => item.id === info.propertyId)
    const monthlyRent = nullableNumber(leaseRecord?.monthly_rent) ?? nullableNumber(leaseForm.monthlyRent) ?? nullableNumber(property?.monthly_rent) ?? 0

    let propertyUpdated = false
    if (property) {
      const updatePayload = {
        tenant: info.tenantNames || property.tenant || null,
        monthly_rent: monthlyRent,
      }

      const { error: propertyError } = await supabase
        .from('properties')
        .update(updatePayload)
        .eq('id', info.propertyId)

      if (propertyError) {
        return { posted: false, reason: 'property_error', error: propertyError }
      }
      propertyUpdated = true
    }

    const existing = monthlyOverrides.find((item) => item.property_id === info.propertyId && item.month_key === info.monthKey)
    const existingNotes = String(existing?.notes || '')
    const alreadyHasTenantSetup = Boolean(
      existing?.tenant_override === info.tenantNames &&
      normalizeDateInputValue(existing?.move_in_date) === info.leaseStartDate
    )

    const noteParts = [
      existingNotes,
      existingNotes.toLowerCase().includes('lease onboarding tenant setup') ? '' : `Lease onboarding tenant setup beginning ${formatDate(info.leaseStartDate)}`,
    ].filter(Boolean)

    const overridePayload = {
      property_id: info.propertyId,
      month_key: info.monthKey,
      override_rent: existing?.override_rent ?? null,
      tenant_override: info.tenantNames || existing?.tenant_override || null,
      move_in_date: info.leaseStartDate,
      move_out_date: existing?.move_out_date || null,
      starting_balance: Number(existing?.starting_balance || 0),
      notes: noteParts.join(' | '),
    }

    let overrideUpdated = false
    if (existing?.id) {
      const { data, error } = await supabase
        .from('monthly_overrides')
        .update(overridePayload)
        .eq('id', existing.id)
        .select('*')
        .single()

      if (error) {
        return { posted: propertyUpdated, reason: 'override_error', error }
      }

      if (data) {
        overrideUpdated = !alreadyHasTenantSetup
        setMonthlyOverrides((current) => {
          const withoutExisting = current.filter((item) => item.id !== data.id && !(item.property_id === data.property_id && item.month_key === data.month_key))
          return [...withoutExisting, data].sort((a, b) => String(a.month_key).localeCompare(String(b.month_key)))
        })
      }
    } else {
      const { data, error } = await supabase
        .from('monthly_overrides')
        .insert(overridePayload)
        .select('*')
        .single()

      if (error) {
        return { posted: propertyUpdated, reason: 'override_error', error }
      }

      if (data) {
        overrideUpdated = true
        setMonthlyOverrides((current) => {
          const withoutExisting = current.filter((item) => item.id !== data.id && !(item.property_id === data.property_id && item.month_key === data.month_key))
          return [...withoutExisting, data].sort((a, b) => String(a.month_key).localeCompare(String(b.month_key)))
        })
      }
    }

    return { posted: propertyUpdated || overrideUpdated, propertyUpdated, overrideUpdated }
  }

  async function postOnboardingDepositRequirements(leaseRecord = null, overrides = {}) {
    const info = getOnboardingDepositInfo(leaseRecord, overrides)

    if (!info.propertyId || !info.tenantNames) {
      return { posted: false, reason: 'missing_property_or_tenant' }
    }

    if ((!info.securityDeposit || info.securityDeposit <= 0) && (!info.petDeposit || info.petDeposit <= 0)) {
      return { posted: false, reason: 'no_deposit_required' }
    }

    const existingRecord = securityDeposits[securityDepositKey(info.propertyId, info.tenantNames)] || null

    const payload = {
      property_id: info.propertyId,
      tenant: info.tenantNames,
      required_amount: info.securityDeposit > 0 ? info.securityDeposit : (existingRecord?.requiredAmount ?? existingRecord?.required_amount ?? null),
      pet_required_amount: info.petDeposit > 0 ? info.petDeposit : (existingRecord?.petRequiredAmount ?? existingRecord?.pet_required_amount ?? null),
      due_date: info.dueDate || existingRecord?.dueDate || existingRecord?.due_date || null,
      pet_due_date: info.petDeposit > 0 ? (info.dueDate || existingRecord?.petDueDate || existingRecord?.pet_due_date || null) : (existingRecord?.petDueDate ?? existingRecord?.pet_due_date ?? null),
      refund_date: existingRecord?.refundDate || existingRecord?.refund_date || null,
      refund_amount: existingRecord?.refundAmount === '' ? null : (existingRecord?.refundAmount ?? existingRecord?.refund_amount ?? null),
      deduction_amount: existingRecord?.deductionAmount === '' ? null : (existingRecord?.deductionAmount ?? existingRecord?.deduction_amount ?? null),
      deduction_note: existingRecord?.deductionNote || existingRecord?.deduction_note || null,
    }

    const { error } = await supabase
      .from('security_deposits')
      .upsert(payload, { onConflict: 'property_id,tenant' })

    if (error) {
      return { posted: false, reason: 'error', error }
    }

    return { posted: true, securityDeposit: info.securityDeposit, petDeposit: info.petDeposit }
  }

  function promptForDepositRequirements(leaseRecord = null) {
    const info = getOnboardingDepositInfo(leaseRecord)
    const securityInput = window.prompt(
      'Security deposit required:',
      info.securityDeposit > 0 ? String(info.securityDeposit) : ''
    )
    if (securityInput === null) return null

    const petInput = window.prompt(
      'Pet deposit required, if any:',
      info.petDeposit > 0 ? String(info.petDeposit) : ''
    )
    if (petInput === null) return null

    const dueDateInput = window.prompt(
      'Deposit due date (YYYY-MM-DD):',
      info.dueDate || getTodayDateInput()
    )
    if (dueDateInput === null) return null

    const securityDeposit = Number(securityInput || 0)
    const petDeposit = Number(petInput || 0)
    const dueDate = normalizeDateInputValue(dueDateInput)

    if (Number.isNaN(securityDeposit) || securityDeposit < 0 || Number.isNaN(petDeposit) || petDeposit < 0) {
      setMessage('Please enter valid deposit amounts. Use 0 if there is no pet deposit.')
      return null
    }

    if (!dueDate) {
      setMessage('Please enter a valid deposit due date.')
      return null
    }

    return { securityDeposit, petDeposit, dueDate }
  }

  async function postRequiredDeposits(leaseRecord = null) {
    setMessage('')
    const overrides = promptForDepositRequirements(leaseRecord)
    if (!overrides) return

    const result = await postOnboardingDepositRequirements(leaseRecord, overrides)
    if (result.error) {
      setMessage(result.error.message)
      return
    }

    await loadData()
    if (result.posted) {
      const parts = []
      if (Number(result.securityDeposit || 0) > 0) parts.push(`Security deposit: ${currency(result.securityDeposit)}`)
      if (Number(result.petDeposit || 0) > 0) parts.push(`Pet deposit: ${currency(result.petDeposit)}`)
      setMessage(`Required deposit amounts saved. ${parts.join(' · ')}`)
    } else {
      setMessage('No deposit amount was entered, so no required deposit was posted.')
    }
  }

  async function postOnboardingCharges(leaseRecord = null, { showMessage = true } = {}) {
    const info = getOnboardingChargeInfo(leaseRecord)

    if (!info.propertyId) {
      if (showMessage) setMessage('Please select a property before posting onboarding charges.')
      return { posted: false, reason: 'missing_property' }
    }

    if (!info.leaseStartDate || !info.monthKey) {
      if (showMessage) setMessage('Please enter a lease start / move-in date before posting onboarding charges.')
      return { posted: false, reason: 'missing_date' }
    }

    const shouldPostProratedRent = Boolean(info.proratedRent && info.proratedRent > 0)
    let rentPosted = false
    let depositPosted = false

    if (!shouldPostProratedRent) {
      const tenantSetupResult = await applyLeaseTenantSetup(leaseRecord, info)
      if (tenantSetupResult.error) {
        if (showMessage) setMessage(tenantSetupResult.error.message)
        return { posted: false, reason: 'tenant_setup_error', error: tenantSetupResult.error }
      }

      const depositResult = await postOnboardingDepositRequirements(leaseRecord)
      depositPosted = Boolean(depositResult.posted)
      if (depositResult.error) {
        if (showMessage) setMessage(depositResult.error.message)
        return { posted: Boolean(tenantSetupResult.posted), tenantPosted: Boolean(tenantSetupResult.posted), reason: 'deposit_error', error: depositResult.error }
      }
      if (showMessage) {
        const parts = []
        if (tenantSetupResult.posted) parts.push('tenant and rent setup posted to the ledger')
        if (depositPosted) parts.push('deposit requirement saved')
        setMessage(parts.length > 0
          ? `${parts.join(' and ')}. No prorated rent amount was entered, so full monthly rent will apply for the move-in month.`
          : 'No prorated rent or saved deposit amount is entered, and the tenant setup was already posted. Use Post Required Deposits if this older lease record needs a deposit amount added.')
      }
      await loadData()
      return { posted: Boolean(tenantSetupResult.posted || depositPosted), rentPosted: false, tenantPosted: Boolean(tenantSetupResult.posted), depositPosted }
    }

    const existing = monthlyOverrides.find((item) => item.property_id === info.propertyId && item.month_key === info.monthKey)
    const existingNotes = String(existing?.notes || '')
    const alreadyPosted = hasPostedOnboardingCharge(leaseRecord)

    if (alreadyPosted) {
      const tenantSetupResult = await applyLeaseTenantSetup(leaseRecord, info)
      if (tenantSetupResult.error) {
        if (showMessage) setMessage(tenantSetupResult.error.message)
        return { posted: false, reason: 'tenant_setup_error', error: tenantSetupResult.error }
      }

      const depositResult = await postOnboardingDepositRequirements(leaseRecord)
      if (depositResult.error) {
        if (showMessage) setMessage(depositResult.error.message)
        return { posted: Boolean(tenantSetupResult.posted), tenantPosted: Boolean(tenantSetupResult.posted), reason: 'deposit_error', error: depositResult.error }
      }
      if (showMessage) {
        setMessage(depositResult.posted
          ? `Onboarding prorated rent was already posted for ${monthLabel(info.monthKey)}. Tenant setup and deposit requirement were also saved.`
          : `Onboarding prorated rent is already posted for ${monthLabel(info.monthKey)}. Tenant setup was checked.`)
      }
      await loadData()
      return { posted: Boolean(tenantSetupResult.posted || depositResult.posted), rentPosted: false, tenantPosted: Boolean(tenantSetupResult.posted), depositPosted: Boolean(depositResult.posted), reason: 'already_posted' }
    }

    const noteParts = [
      existingNotes && !existingNotes.toLowerCase().includes('lease onboarding prorated rent') ? existingNotes : '',
      `Lease onboarding prorated rent through ${formatDate(info.paidThroughDate || endOfMonth(info.monthKey))}`,
    ].filter(Boolean)

    const payload = {
      property_id: info.propertyId,
      month_key: info.monthKey,
      override_rent: info.proratedRent,
      tenant_override: info.tenantNames || null,
      move_in_date: info.leaseStartDate,
      move_out_date: existing?.move_out_date || null,
      starting_balance: Number(existing?.starting_balance || 0),
      notes: noteParts.join(' | '),
    }

    let error
    let data

    if (existing?.id) {
      ;({ data, error } = await supabase
        .from('monthly_overrides')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single())
    } else {
      ;({ data, error } = await supabase
        .from('monthly_overrides')
        .insert(payload)
        .select('*')
        .single())
    }

    if (error) {
      if (showMessage) setMessage(error.message)
      return { posted: false, reason: 'error', error }
    }

    if (data) {
      rentPosted = true
      setMonthlyOverrides((current) => {
        const withoutExisting = current.filter((item) => item.id !== data.id && !(item.property_id === data.property_id && item.month_key === data.month_key))
        return [...withoutExisting, data].sort((a, b) => String(a.month_key).localeCompare(String(b.month_key)))
      })
    }

    const depositResult = await postOnboardingDepositRequirements(leaseRecord)
    depositPosted = Boolean(depositResult.posted)
    if (depositResult.error) {
      if (showMessage) setMessage(depositResult.error.message)
      return { posted: rentPosted, rentPosted, depositPosted: false, reason: 'deposit_error', error: depositResult.error }
    }

    const property = companyProperties.find((item) => item.id === info.propertyId)
    if (property) {
      await supabase
        .from('properties')
        .update({
          tenant: info.tenantNames || property.tenant || null,
          monthly_rent: leaseRecord?.monthly_rent ?? (leaseForm.monthlyRent === '' ? property.monthly_rent : Number(leaseForm.monthlyRent || property.monthly_rent || 0)),
        })
        .eq('id', info.propertyId)
    }

    await loadData()

    if (showMessage) {
      const depositText = depositPosted ? ' Deposit requirement was also saved.' : ''
      setMessage(`Prorated onboarding charge posted: ${currency(info.proratedRent)} for ${monthLabel(info.monthKey)}. Full monthly rent will begin with the next rent cycle.${depositText}`)
    }

    return { posted: rentPosted || depositPosted, rentPosted, depositPosted, data }
  }

  async function saveLeaseRecord({ openPrint = false } = {}) {
    setMessage('')

    if (!selectedCompanyId) {
      setMessage('Please select a company first.')
      return
    }

    if (!leaseForm.propertyId) {
      setMessage('Please select a property before saving the lease record.')
      return
    }

    if (getLeaseTenantContacts().length === 0) {
      setMessage('Please enter at least one tenant name before saving the lease record.')
      return
    }

    const { data, error } = await supabase
      .from('leases')
      .insert(buildLeasePayload('draft'))
      .select('*')
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    let onboardingChargeResult = { posted: false }

    if (data) {
      setLeases((current) => [data, ...current.filter((item) => item.id !== data.id)])
      await saveTenantProfileFromLease(data)
      onboardingChargeResult = await postOnboardingCharges(data, { showMessage: false })
    }

    const chargeParts = []
    if (onboardingChargeResult.rentPosted) chargeParts.push('prorated rent was posted to the ledger')
    if (onboardingChargeResult.tenantPosted) chargeParts.push('tenant/rent setup was posted')
    if (onboardingChargeResult.depositPosted) chargeParts.push('deposit requirement was saved')
    const chargeMessage = chargeParts.length > 0 ? ` ${chargeParts.join(' and ')}.` : ''

    setMessage(openPrint
      ? `Lease record saved.${chargeMessage} Your print dialog will open so you can save the PDF for Adobe signatures.`
      : `Lease record saved.${chargeMessage} You can now print/save the PDF and upload the signed copy when it comes back from Adobe.`)

    if (openPrint) {
      setTimeout(() => printLeasePackage(), 150)
    }
  }

  async function markLeaseStatus(leaseId, status) {
    setMessage('')
    const { data, error } = await supabase
      .from('leases')
      .update({ status })
      .eq('id', leaseId)
      .select('*')
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    if (data) {
      setLeases((current) => current.map((item) => (item.id === leaseId ? data : item)))
      setMessage(`Lease marked as ${status}.`)
    }
  }

  async function uploadSignedLease(leaseRecord, file) {
    if (!file || !leaseRecord?.id) return

    setMessage('')
    setUploadingLeaseId(leaseRecord.id)

    const userId = session?.user?.id
    if (!userId) {
      setMessage('No logged-in user found.')
      setUploadingLeaseId('')
      return
    }

    const cleanFileName = file.name.replace(/[^a-z0-9._-]+/gi, '_')
    const filePath = `${userId}/${leaseRecord.id}/${Date.now()}_${cleanFileName}`

    const { error: uploadError } = await supabase.storage
      .from('lease-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/pdf',
      })

    if (uploadError) {
      setMessage(uploadError.message)
      setUploadingLeaseId('')
      return
    }

    const { data, error } = await supabase
      .from('leases')
      .update({
        signed_file_path: filePath,
        signed_file_name: file.name,
        signed_at: new Date().toISOString(),
        status: 'signed',
      })
      .eq('id', leaseRecord.id)
      .select('*')
      .single()

    if (error) {
      setMessage(error.message)
      setUploadingLeaseId('')
      return
    }

    if (data) {
      setLeases((current) => current.map((item) => (item.id === leaseRecord.id ? data : item)))
    }

    setUploadingLeaseId('')
    setMessage('Signed lease uploaded and attached to the lease record.')
  }

  async function openSignedLease(leaseRecord) {
    if (!leaseRecord?.signed_file_path) {
      setMessage('No signed lease file has been uploaded for this record yet.')
      return
    }

    const { data, error } = await supabase.storage
      .from('lease-documents')
      .createSignedUrl(leaseRecord.signed_file_path, 60 * 60)

    if (error) {
      setMessage(error.message)
      return
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }
  }

  async function deleteLeaseRecord(leaseRecord) {
    const confirmed = confirmDeleteWithPrompt(
      `Delete lease record for ${leaseRecord.tenant_names || 'this tenant'}?\n\nThis removes the lease record. Uploaded signed PDF files may remain in storage unless manually removed.`
    )
    if (!confirmed) return

    setMessage('')
    const { error } = await supabase.from('leases').delete().eq('id', leaseRecord.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setLeases((current) => current.filter((item) => item.id !== leaseRecord.id))
    setMessage('Lease record deleted.')
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

  function exportBankDepositCsv() {
    const reportPeriod = selectedBankDepositPeriod === 'year'
      ? String(selectedMonth || getCurrentMonthKey()).slice(0, 4)
      : selectedMonth
    const propertyPart = selectedBankDepositPropertyId
      ? bankDepositReportPropertyLabel.replace(/[^a-z0-9]+/gi, '_')
      : 'all_properties'

    const rows = [
      ['Date', 'Property', 'Method', 'Amount', 'Note'],
      ...bankDepositReportRows.map((payment) => [
        formatDate(payment.payment_date),
        payment.propertyAddress,
        payment.method || 'Bank Deposit',
        Number(payment.amount || 0).toFixed(2),
        payment.note || '',
      ]),
      ['', '', 'Total Bank Deposits', bankDepositReportTotal.toFixed(2), ''],
    ]

    downloadCsv(`bank_deposits_${reportPeriod}_${propertyPart}.csv`, rows)
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
          <div style={styles.authLogoWrap}>
            <img src={logoSrc} alt="Open Door Support" style={styles.authLogo} />
          </div>
          <h1 style={styles.authTitle}>Open Door Support</h1>
          <p style={styles.authSubtitle}>Sign in to manage companies, properties, payments, and reports.</p>

          <form onSubmit={signIn}>
            <label style={styles.label}>Email</label>
            <input className="mobile-input" style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label style={styles.label}>Password</label>
            <input className="mobile-input" style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="mobile-button-row" style={styles.buttonRow}>
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
          .responsive-section-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 768px) {
          html, body, #root {
            overflow-x: hidden;
            width: 100%;
            max-width: 100%;
          }

          .mobile-top-controls,
          .responsive-section-grid,
          .responsive-ledger-grid,
          .responsive-report-grid {
            grid-template-columns: 1fr !important;
          }

          .mobile-card-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .mobile-brand-header {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            padding: 16px !important;
            border-radius: 18px !important;
          }

          .mobile-logo-panel {
            order: -1;
            min-width: 0 !important;
          }

          .mobile-logo-wrap {
            padding: 10px 14px !important;
            width: 100% !important;
            min-height: 110px !important;
            box-sizing: border-box !important;
          }

          .mobile-logo {
            width: 100% !important;
            max-width: 300px !important;
            height: auto !important;
            margin: 0 auto !important;
            display: block !important;
          }

          .mobile-brand-title {
            font-size: 24px !important;
          }

          .mobile-brand-subtitle {
            font-size: 12px !important;
          }

          .mobile-header-actions {
            width: 100%;
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 10px !important;
            padding-top: 12px !important;
          }

          .mobile-header-actions button {
            width: 100%;
            margin-top: 0 !important;
          }

          .mobile-control-block,
          .mobile-card,
          .mobile-hero-card {
            padding: 14px !important;
          }

          .mobile-input,
          .mobile-textarea {
            width: 100% !important;
            max-width: 100% !important;
            font-size: 16px !important;
          }

          .mobile-payment-button-row {
            flex-direction: column !important;
          }

          .mobile-payment-button-row button {
            width: 100%;
            margin-top: 0 !important;
          }
        }
      `}</style>

      <div className="responsive-header mobile-brand-header" style={styles.brandHeader}>
        <div style={styles.brandTextColumn}>
          <div>
            <h1 className="mobile-brand-title" style={styles.brandTitle}>Open Door Support</h1>
            <p className="mobile-brand-subtitle" style={styles.brandSubtitle}>Property Management System</p>
          </div>

          <div className="mobile-header-actions" style={styles.headerActions}>
            <button style={styles.secondaryButton} onClick={printOwnerReport}>Print Report</button>
            <button style={styles.secondaryButton} onClick={signOut}>Sign Out</button>
          </div>
        </div>

        <div className="mobile-logo-panel" style={styles.logoPanel}>
          <div className="mobile-logo-wrap" style={styles.logoWrap}>
            <img className="mobile-logo" src={logoSrc} alt="Open Door Support" style={styles.logo} />
          </div>
        </div>
      </div>

      {isMobile ? (
        <div style={styles.mobileModeBanner}>
          <div style={styles.mobileModeEyebrow}>Mobile mode</div>
          <div style={styles.mobileModeTitle}>Quick Payment view opens first on phone</div>
          <div style={styles.mobileModeText}>Use the Payments tab for the phone-friendly entry screen. All other tabs are still available below.</div>
        </div>
      ) : null}

      <div className="mobile-top-controls" style={styles.topControls}>
        <div className="mobile-control-block" style={styles.controlBlock}>
          <label style={styles.label}>Company</label>
          <select className="mobile-input" style={styles.input} value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
            <option value="">Select a company</option>
            {filteredCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_name || company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mobile-control-block" style={styles.controlBlock}>
          <label style={styles.label}>Month</label>
          <select className="mobile-input" style={styles.input} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{monthLabel(month)}</option>
            ))}
          </select>
        </div>

        <div className="mobile-control-block" style={styles.controlBlock}>
          <label style={styles.label}>Search</label>
          <input
            style={styles.input}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, property, or tenant"
          />
        </div>
      </div>

      {searchQuery ? (
        <div style={styles.searchSummaryBar}>
          Showing filtered results for <strong>{searchQuery}</strong>.
          <button style={styles.linkButton} type="button" onClick={() => setSearchQuery('')}>Clear</button>
        </div>
      ) : null}

      <div className="mobile-tab-row" style={styles.tabRow}>
        <button style={activeTab === 'dashboard' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button style={activeTab === 'companies' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('companies')}>Companies</button>
        <button style={activeTab === 'properties' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('properties')}>Properties</button>
        <button style={activeTab === 'payments' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('payments')}>Payments</button>
        <button style={activeTab === 'overrides' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('overrides')}>Overrides</button>
        <button style={activeTab === 'ledger' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('ledger')}>Ledger</button>
        <button style={activeTab === 'reports' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('reports')}>Reports</button>
        <button style={activeTab === 'notesAlerts' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('notesAlerts')}>Note & Security Deposit</button>
        <button style={activeTab === 'onboarding' ? styles.activeTabButton : styles.tabButton} onClick={() => setActiveTab('onboarding')}>Tenant Onboarding</button>
      </div>

      {!isMobile ? <div className="mobile-card-grid" style={styles.cardGrid}>
        <div className="mobile-kpi-card" style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Company</div>
          <div style={styles.kpiValueSmall}>{selectedCompanyName}</div>
        </div>
        <div className="mobile-kpi-card" style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Properties</div>
          <div style={styles.kpiValue}>{totalProperties}</div>
        </div>
        <div className="mobile-kpi-card" style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Monthly Rent</div>
          <div style={styles.kpiValue}>{currency(totalMonthlyRent)}</div>
        </div>
        <div className="mobile-kpi-card" style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Collected</div>
          <div style={styles.kpiValue}>{currency(totalCollected)}</div>
        </div>
        <div className="mobile-kpi-card" style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Outstanding</div>
          <div style={styles.kpiValue}>{currency(totalOutstanding)}</div>
        </div>
        <div className="mobile-kpi-card" style={styles.kpiCard}>
          <div style={styles.kpiLabel}>10% Mgmt Fee</div>
          <div style={styles.kpiValue}>{currency(managementFeeCollected)}</div>
        </div>
      </div> : null}

      {message ? <div style={styles.messageBanner}>{message}</div> : null}

      {activeTab === 'dashboard' && (
        <div style={styles.sectionGridSingle}>
          <div className="mobile-card" style={styles.card}>
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
                  {filteredLedgerRows.length === 0 ? (
                    <tr><td style={styles.td} colSpan="5">No matching properties for this view.</td></tr>
                  ) : (
                    filteredLedgerRows.map((row) => (
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

          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Dashboard Alerts</h2>
                <p style={styles.smallMuted}>Quick watch list for balances, vacancies, and move-outs.</p>
              </div>
              <div style={styles.alertSummaryInline}>
                <span style={styles.alertBadgeHigh}>{highAlertCount} high</span>
                <span style={styles.alertBadgeMedium}>{mediumAlertCount} medium</span>
                <span style={styles.alertBadgeLow}>{lowAlertCount} low</span>
              </div>
            </div>

            {companyAlerts.length === 0 ? (
              <div style={styles.notesBox}>No alerts for the current company and month.</div>
            ) : (
              <div style={styles.alertList}>
                {companyAlerts.slice(0, 8).map((alert) => (
                  <div key={alert.id} style={styles.alertCard}>
                    <div style={styles.alertCardTopRow}>
                      <span style={alert.severity === 'high' ? styles.alertBadgeHigh : alert.severity === 'medium' ? styles.alertBadgeMedium : styles.alertBadgeLow}>
                        {alert.category}
                      </span>
                      <button
                        style={styles.linkButton}
                        type="button"
                        onClick={() => {
                          setSelectedNotesPropertyId(alert.propertyId || '')
                          setActiveTab('notesAlerts')
                        }}
                      >
                        Open notes
                      </button>
                    </div>
                    <div style={styles.alertCardTitle}>{alert.title}</div>
                    <div style={styles.smallMuted}>{alert.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div className="responsive-section-grid" style={styles.sectionGrid}>
          <div className="mobile-card" style={styles.card}>
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

          <div className="mobile-card" style={styles.card}>
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
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Properties</h2>
                <p style={styles.smallMuted}>Archive keeps a property in your historical reports without leaving it in your active working list.</p>
              </div>
              <label style={styles.inlineToggleLabel}>
                <input
                  type="checkbox"
                  checked={showArchivedProperties}
                  onChange={(e) => setShowArchivedProperties(e.target.checked)}
                />
                <span>Show archived properties</span>
              </label>
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Address</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Tenant</th>
                    <th style={styles.th}>Rent</th>
                    <th style={styles.th}>Due Day</th>
                    <th style={styles.th}>Late Fee</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisibleProperties.length === 0 ? (
                    <tr><td style={styles.td} colSpan="7">No matching properties to show for this company.</td></tr>
                  ) : (
                    filteredVisibleProperties.map((property) => (
                      <tr key={property.id}>
                        <td style={styles.td}>
                          {editingPropertyId === property.id ? (
                            <input style={styles.tableInput} value={editPropertyForm.address} onChange={(e) => setEditPropertyForm({ ...editPropertyForm, address: e.target.value })} />
                          ) : property.address}
                        </td>
                        <td style={styles.td}>
                          <span style={property.is_active === false ? styles.archivedBadge : styles.activeBadge}>
                            {property.is_active === false ? 'Archived' : 'Active'}
                          </span>
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
                                {property.is_active === false ? (
                                  <button style={styles.smallPrimaryButton} type="button" onClick={() => restoreProperty(property.id, property.address)}>Restore</button>
                                ) : (
                                  <button style={styles.smallDangerButton} type="button" onClick={() => archiveProperty(property.id, property.address)}>Archive</button>
                                )}
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

          <div className="mobile-card" style={styles.card}>
            <h2 style={styles.cardTitle}>Add Property</h2>
            <form onSubmit={addProperty}>
              <label style={styles.label}>Address</label>
              <input className="mobile-input" style={styles.input} value={propertyForm.address} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} />
              <label style={styles.label}>Tenant</label>
              <input className="mobile-input" style={styles.input} value={propertyForm.tenant} onChange={(e) => setPropertyForm({ ...propertyForm, tenant: e.target.value })} />
              <label style={styles.label}>Monthly Rent</label>
              <input className="mobile-input" style={styles.input} type="number" value={propertyForm.monthlyRent} onChange={(e) => setPropertyForm({ ...propertyForm, monthlyRent: e.target.value })} />
              <label style={styles.label}>Due Day</label>
              <input className="mobile-input" style={styles.input} type="number" value={propertyForm.dueDay} onChange={(e) => setPropertyForm({ ...propertyForm, dueDay: e.target.value })} />
              <label style={styles.label}>Late Fee</label>
              <input className="mobile-input" style={styles.input} type="number" value={propertyForm.lateFee} onChange={(e) => setPropertyForm({ ...propertyForm, lateFee: e.target.value })} />
              <button style={styles.primaryButton} type="submit">Save Property</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="responsive-section-grid" style={styles.sectionGrid}>
          {isMobile ? (
            <div style={styles.mobilePaymentBanner}>
              <div style={styles.mobilePaymentBannerTitle}>Phone-friendly payment screen</div>
              <div style={styles.mobilePaymentBannerText}>This tab is now the default mobile landing screen so you can get straight to payment entry.</div>
            </div>
          ) : null}
          <div className="mobile-card" style={styles.card}>
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
                  {filteredMonthlyPayments.length === 0 ? (
                    <tr><td style={styles.td} colSpan="6">No matching payments entered for this month.</td></tr>
                  ) : (
                    filteredMonthlyPayments.map((payment) => {
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

          <div className="mobile-card" style={styles.card}>
            <div className="mobile-hero-card" style={styles.mobileHeroCard}>
              <div style={styles.mobileHeroEyebrow}>Open Door Support</div>
              <h2 style={styles.mobileHeroTitle}>Quick Payment Entry</h2>
              <p style={styles.mobileHeroText}>Built for easier phone use with larger controls, stacked spacing, and voice-friendly entry tools.</p>
            </div>
            <p style={styles.smallMuted}>Default date starts on today, the last saved payment method is remembered, and you can save another payment without rebuilding the form.</p>
            <div style={styles.infoBanner}>Payments post by the payment date you enter, not the month currently showing at the top. After you save, the month selector will follow that payment date so you can see it in the right month.</div>

            <div style={styles.voiceCard}>
              <div style={styles.voiceHeaderRow}>
                <div>
                  <div style={styles.voiceTitle}>Voice Payment Entry</div>
                  <div style={styles.smallMuted}>Say something like: “5342A St. Matthew Lane, March 8 2026, 1100 dollars, cash.”</div>
                </div>
                <div style={styles.voiceButtonGroup}>
                  <button
                    style={isListening ? styles.voiceDangerButton : styles.voicePrimaryButton}
                    type="button"
                    onClick={isListening ? stopVoiceEntry : startVoiceEntry}
                  >
                    {isListening ? 'Stop Listening' : 'Use Phone Mic'}
                  </button>
                  <button
                    style={styles.voiceSecondaryButton}
                    type="button"
                    onClick={focusTranscriptForKeyboardMic}
                  >
                    Use Keyboard Mic
                  </button>
                </div>
              </div>

              <div style={styles.voiceHelpBox}>
                <strong>Android tip:</strong> In Chrome or Edge, try <strong>Use Phone Mic</strong>. If that does not work well on your phone, tap <strong>Use Keyboard Mic</strong>, speak into your keyboard microphone, then press <strong>Apply Transcript</strong>.
              </div>

              {voiceStatus ? <div style={styles.infoBanner}>{voiceStatus}</div> : null}

              {!browserSupportsVoiceEntry() ? (
                <div style={styles.warningBanner}>This browser may not support direct voice dictation. The keyboard mic option still works well on many Android phones.</div>
              ) : null}

              <label style={styles.label}>Transcript</label>
              <textarea
                ref={voiceTranscriptRef}
                style={styles.textarea}
                rows={4}
                value={voiceTranscript}
                onChange={(e) => {
                  setVoiceTranscript(e.target.value)
                  setVoiceStatus('Transcript updated. Use Apply Transcript to fill the payment form.')
                }}
                placeholder="Your dictated payment will appear here. You can also tap into this box and use your phone keyboard microphone."
              />
              <div style={styles.voiceButtonGroup}>
                <button
                  style={styles.voiceSecondaryButton}
                  type="button"
                  onClick={() => applyVoicePaymentTranscript(voiceTranscript)}
                >
                  Apply Transcript
                </button>
                <button
                  style={styles.voiceSecondaryButton}
                  type="button"
                  onClick={() => {
                    setVoiceTranscript('')
                    setVoiceStatus('')
                    if (voiceTranscriptRef.current) voiceTranscriptRef.current.focus()
                  }}
                >
                  Clear Voice Entry
                </button>
              </div>
            </div>

            {paymentSuccessMessage ? (
              <div style={styles.successBanner}>{paymentSuccessMessage}</div>
            ) : null}

            {lastReceipt?.message ? (
              <div style={styles.receiptBox}>
                <strong>Receipt ready</strong>
                <pre style={styles.receiptPreview}>{lastReceipt.message}</pre>
                <div className="mobile-button-row" style={styles.buttonRow}>
                  <button style={styles.primaryButton} type="button" onClick={() => openTextReceipt(lastReceipt)}>Text Receipt</button>
                  <button style={styles.secondaryButton} type="button" onClick={() => copyReceipt(lastReceipt)}>Copy Receipt</button>
                </div>
                {lastReceipt.contactOptions?.length > 1 ? (
                  <div className="mobile-button-row" style={styles.buttonRow}>
                    {lastReceipt.contactOptions.map((contact) => (
                      <button key={`${contact.name}-${contact.phone}`} style={styles.smallSecondaryButton} type="button" onClick={() => openTextReceipt(lastReceipt, contact.phone)}>
                        Text {contact.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!lastReceipt.phone ? <div style={styles.smallMuted}>No tenant phone is saved yet, so Copy Receipt may be easiest for this one.</div> : null}
              </div>
            ) : null}

            <form onSubmit={addPayment}>
              <label style={styles.label}>Property</label>
              <select
                style={styles.input}
                value={paymentForm.propertyId}
                onChange={(e) => {
                  setPaymentSuccessMessage('')
                  setPaymentForm({ ...paymentForm, propertyId: e.target.value })
                }}
              >
                <option value="">Select property</option>
                {filteredPropertyOptions.filter((property) => property.is_active !== false).map((property) => (
                  <option key={property.id} value={property.id}>{property.address}</option>
                ))}
              </select>

              <label style={styles.label}>Payment Date</label>
              <input
                style={styles.input}
                type="date"
                value={paymentForm.paymentDate}
                onChange={(e) => {
                  setPaymentSuccessMessage('')
                  setPaymentForm({ ...paymentForm, paymentDate: e.target.value })
                }}
              />

              <label style={styles.label}>Amount</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => {
                  setPaymentSuccessMessage('')
                  setPaymentForm({ ...paymentForm, amount: e.target.value })
                }}
              />

              <label style={styles.label}>Method</label>
              <select
                style={styles.input}
                value={paymentForm.method}
                onChange={(e) => {
                  setPaymentSuccessMessage('')
                  setPaymentForm({ ...paymentForm, method: e.target.value })
                }}
              >
                <option value="Cash">Cash</option>
                <option value="Bank Deposit">Bank Deposit</option>
                <option value="Check">Check</option>
                <option value="Money Order">Money Order</option>
                <option value="Cash App">Cash App</option>
                <option value="Zelle">Zelle</option>
                <option value="Venmo">Venmo</option>
                <option value="Late Fee">Late Fee</option>
              </select>

              <div style={styles.smallMuted}>Last used method will carry forward after you save. Use Add Late Fee below to post a separate late-fee charge instead of increasing rent.</div>

              <label style={styles.label}>Note</label>
              <input
                style={styles.input}
                value={paymentForm.note}
                onChange={(e) => {
                  setPaymentSuccessMessage('')
                  setPaymentForm({ ...paymentForm, note: e.target.value })
                }}
              />

              <div className="mobile-button-row" style={styles.buttonRow}>
                <button style={styles.primaryButton} type="submit">Save Payment</button>
                <button style={styles.secondaryButton} type="button" onClick={addPaymentAndContinue}>Save + Add Another</button>
                <button style={styles.secondaryButton} type="button" onClick={addLateFee}>Add Late Fee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'overrides' && (
        <div className="mobile-card" style={styles.card}>
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
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Property Ledger</h2>
                <p style={styles.smallMuted}>
                  One running account view for charges, late fees, adjustments, payments, and carried balances. Security deposit details are shown separately above.
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
                  className="mobile-input"
                  style={styles.input}
                  value={selectedReportPropertyId}
                  onChange={(e) => setSelectedReportPropertyId(e.target.value)}
                >
                  <option value="">Select property</option>
                  {filteredPropertyOptions.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Start Date</label>
                <input
                  className="mobile-input"
                  style={styles.input}
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>End Date</label>
                <input
                  className="mobile-input"
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

            {(selectedLedgerDepositSummary.requiredAmount || selectedLedgerDepositSummary.totalPaid || selectedLedgerDepositRecord.refundAmount || selectedLedgerDepositRecord.deductionAmount) ? (
              <div style={styles.notesBox}>
                <div style={styles.reportHeaderRow}>
                  <div>
                    <div style={styles.cardTitle}>Security Deposit Summary</div>
                    <div style={styles.smallMuted}>Tracked separately from the rent ledger.</div>
                  </div>
                </div>
                <div style={styles.ledgerSummaryGrid}>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Required Deposit</div>
                    <div style={styles.ledgerMiniValue}>{currency(selectedLedgerDepositSummary.requiredAmount)}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Paid So Far</div>
                    <div style={styles.ledgerMiniValue}>{currency(selectedLedgerDepositSummary.totalPaid)}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Balance Owed</div>
                    <div style={styles.ledgerMiniValue}>{currency(selectedLedgerDepositSummary.balanceOwed)}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Refund</div>
                    <div style={styles.ledgerMiniValue}>{currency(selectedLedgerDepositSummary.refundAmount)}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Deductions</div>
                    <div style={styles.ledgerMiniValue}>{currency(selectedLedgerDepositSummary.deductionAmount)}</div>
                  </div>
                </div>
                {selectedLedgerDepositTenant ? (
                  <div style={styles.smallMuted}>Tenant: {selectedLedgerDepositTenant}</div>
                ) : null}
                {selectedLedgerDepositRecord.dueDate ? (
                  <div style={styles.smallMuted}>Deposit Due Date: {formatDate(selectedLedgerDepositRecord.dueDate)}</div>
                ) : null}
                {selectedLedgerDepositRecord.refundDate ? (
                  <div style={styles.smallMuted}>Refund Date: {formatDate(selectedLedgerDepositRecord.refundDate)}</div>
                ) : null}
                {selectedLedgerDepositRecord.deductionNote ? (
                  <div style={styles.smallMuted}>Deduction Note: {selectedLedgerDepositRecord.deductionNote}</div>
                ) : null}
              </div>
            ) : null}

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


      {activeTab === 'notesAlerts' && (
        <div className="responsive-section-grid" style={styles.sectionGrid}>
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Property Notes</h2>
                <p style={styles.smallMuted}>Use this for payment-plan details, move-out promises, special agreements, or anything you want attached to the property record.</p>
              </div>
              <div style={styles.alertSummaryInline}>
                <span style={styles.notesCountPill}>{notesCount} saved note{notesCount === 1 ? '' : 's'}</span>
              </div>
            </div>

            <label style={styles.label}>Property</label>
            <select
              style={styles.input}
              value={selectedNotesPropertyId}
              onChange={(e) => setSelectedNotesPropertyId(e.target.value)}
            >
              <option value="">Select property</option>
              {filteredPropertyOptions.map((property) => (
                <option key={`notes-${property.id}`} value={property.id}>
                  {property.address}
                </option>
              ))}
            </select>

            {notesProperty ? (
              <div style={styles.notesMetaGrid}>
                <div style={styles.ledgerMiniCard}>
                  <div style={styles.kpiLabel}>Current Tenant</div>
                  <div style={styles.kpiValueSmall}>{notesPropertyTenant || 'Vacant'}</div>
                </div>
                <div style={styles.ledgerMiniCard}>
                  <div style={styles.kpiLabel}>Status</div>
                  <div style={styles.kpiValueSmall}>{notesProperty.is_active === false ? 'Archived' : 'Active'}</div>
                </div>
                <div style={styles.ledgerMiniCard}>
                  <div style={styles.kpiLabel}>Last Updated</div>
                  <div style={styles.kpiValueSmall}>
                    {propertyNotes[selectedNotesPropertyId]?.updatedAt ? formatDate(propertyNotes[selectedNotesPropertyId].updatedAt) : 'No saved note yet'}
                  </div>
                </div>
              </div>
            ) : null}

            <label style={styles.label}>Property Notes</label>
            <textarea
              style={styles.textarea}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Examples: agreed payment plan, move-out date promise, approved rent adjustment, maintenance-related credit, follow-up reminders."
            />

            <div className="mobile-button-row" style={styles.buttonRow}>
              <button style={styles.primaryButton} type="button" onClick={savePropertyNote}>Save Notes</button>
              <button style={styles.secondaryButton} type="button" onClick={clearPropertyNote}>Clear Notes</button>
            </div>
          </div>

          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Note & Security Deposit</h2>
                <p style={styles.smallMuted}>Track required deposit, installment payments, balance owed, refunds, and any deductions.</p>
              </div>
            </div>

            <label style={styles.label}>Property</label>
            <select
              style={styles.input}
              value={selectedDepositPropertyId}
              onChange={(e) => setSelectedDepositPropertyId(e.target.value)}
            >
              <option value="">Select property</option>
              {filteredPropertyOptions.map((property) => (
                <option key={`deposit-${property.id}`} value={property.id}>
                  {property.address}
                </option>
              ))}
            </select>

            {selectedDepositProperty ? (
              <>
                <div style={styles.notesMetaGrid}>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Tenant</div>
                    <div style={styles.kpiValueSmall}>{selectedDepositTenant || 'Vacant'}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Required Deposit</div>
                    <div style={styles.kpiValueSmall}>{currency(selectedDepositSummary.requiredAmount)}</div>
                    <div style={styles.smallMuted}>Pet: {currency(selectedDepositSummary.petRequiredAmount)}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Paid So Far</div>
                    <div style={styles.kpiValueSmall}>{currency(selectedDepositSummary.totalPaid)}</div>
                    <div style={styles.smallMuted}>Security {currency(selectedDepositSummary.securityPaid)} • Pet {currency(selectedDepositSummary.petPaid)}</div>
                  </div>
                  <div style={styles.ledgerMiniCard}>
                    <div style={styles.kpiLabel}>Balance Owed</div>
                    <div style={styles.kpiValueSmall}>{currency(selectedDepositSummary.balanceOwed)}</div>
                    <div style={styles.smallMuted}>Security {currency(selectedDepositSummary.securityBalanceOwed)} • Pet {currency(selectedDepositSummary.petBalanceOwed)}</div>
                  </div>
                </div>

                <div style={styles.statementFilterGrid}>
                  <div>
                    <label style={styles.label}>Deposit Required</label>
                    <input
                      style={styles.input}
                      type="number"
                      step="0.01"
                      value={depositDraft.requiredAmount}
                      onChange={(e) => updateDepositRecord({ requiredAmount: e.target.value })}
                      placeholder="Usually same as rent"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Deposit Due Date</label>
                    <input
                      style={styles.input}
                      type="date"
                      value={normalizeDateInputValue(depositDraft.dueDate)}
                      onChange={(e) => updateDepositRecord({ dueDate: normalizeDateInputValue(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Pet Deposit Required</label>
                    <input
                      style={styles.input}
                      type="number"
                      step="0.01"
                      value={depositDraft.petRequiredAmount}
                      onChange={(e) => updateDepositRecord({ petRequiredAmount: e.target.value })}
                      placeholder="If applicable"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Pet Deposit Due Date</label>
                    <input
                      style={styles.input}
                      type="date"
                      value={normalizeDateInputValue(depositDraft.petDueDate)}
                      onChange={(e) => updateDepositRecord({ petDueDate: normalizeDateInputValue(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={styles.notesBox}>
                  <strong>Add Deposit Payment</strong>
                  <div style={{ ...styles.statementFilterGrid, marginTop: '12px' }}>
                    <div>
                      <label style={styles.label}>Date</label>
                      <input style={styles.input} type="date" value={normalizeDateInputValue(depositPaymentForm.paymentDate)} onChange={(e) => setDepositPaymentForm({ ...depositPaymentForm, paymentDate: normalizeDateInputValue(e.target.value) })} />
                    </div>
                    <div>
                      <label style={styles.label}>Amount</label>
                      <input style={styles.input} type="number" step="0.01" value={depositPaymentForm.amount} onChange={(e) => setDepositPaymentForm({ ...depositPaymentForm, amount: e.target.value })} />
                    </div>
                    <div>
                      <label style={styles.label}>Payment For</label>
                      <select style={styles.input} value={depositPaymentForm.paymentType} onChange={(e) => setDepositPaymentForm({ ...depositPaymentForm, paymentType: e.target.value })}>
                        <option value="security">Security Deposit</option>
                        <option value="pet">Pet Deposit</option>
                      </select>
                    </div>
                    <div>
                      <label style={styles.label}>Method</label>
                      <select style={styles.input} value={depositPaymentForm.method} onChange={(e) => setDepositPaymentForm({ ...depositPaymentForm, method: e.target.value })}>
                        <option value="Cash">Cash</option>
                        <option value="Bank Deposit">Bank Deposit</option>
                        <option value="Check">Check</option>
                        <option value="Money Order">Money Order</option>
                        <option value="Cash App">Cash App</option>
                        <option value="Zelle">Zelle</option>
                        <option value="Venmo">Venmo</option>
                      </select>
                    </div>
                  </div>
                  <label style={styles.label}>Note</label>
                  <input style={styles.input} value={depositPaymentForm.note} onChange={(e) => setDepositPaymentForm({ ...depositPaymentForm, note: e.target.value })} />
                  <div className="mobile-button-row" style={styles.buttonRow}>
                    <button style={styles.primaryButton} type="button" onClick={addSecurityDepositPayment}>Save Deposit Payment</button>
                  </div>
                  {(lastReceipt?.type === 'security_deposit' || lastReceipt?.type === 'pet_deposit') && lastReceipt?.message ? (
                    <div style={styles.receiptBox}>
                      <strong>{lastReceipt.type === 'pet_deposit' ? 'Pet deposit receipt ready' : 'Security deposit receipt ready'}</strong>
                      <pre style={styles.receiptPreview}>{lastReceipt.message}</pre>
                      <div className="mobile-button-row" style={styles.buttonRow}>
                        <button style={styles.primaryButton} type="button" onClick={() => openTextReceipt(lastReceipt)}>Text Receipt</button>
                        <button style={styles.secondaryButton} type="button" onClick={() => copyReceipt(lastReceipt)}>Copy Receipt</button>
                      </div>
                      {!lastReceipt.phone ? <div style={styles.smallMuted}>No tenant phone is saved yet, so Copy Receipt may be easiest for this one.</div> : null}
                    </div>
                  ) : null}
                </div>

                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Method</th>
                        <th style={styles.th}>Amount</th>
                        <th style={styles.th}>Note</th>
                        <th style={styles.th}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDepositRecord.payments.length === 0 ? (
                        <tr><td style={styles.td} colSpan="6">No deposit payments saved yet.</td></tr>
                      ) : (
                        selectedDepositRecord.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td style={styles.td}>{formatDate(payment.paymentDate)}</td>
                            <td style={styles.td}>{payment.paymentType === 'pet' ? 'Pet Deposit' : 'Security Deposit'}</td>
                            <td style={styles.td}>{payment.method}</td>
                            <td style={styles.td}>{currency(payment.amount)}</td>
                            <td style={styles.td}>{payment.note || '—'}</td>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button style={styles.smallSecondaryButton} type="button" onClick={() => editSecurityDepositPayment(payment)}>Edit</button>
                                <button style={styles.smallDangerButton} type="button" onClick={() => deleteSecurityDepositPayment(payment.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={styles.notesBox}>
                  <strong>Refund / Deduction Summary</strong>
                  <div style={{ ...styles.statementFilterGrid, marginTop: '12px' }}>
                    <div>
                      <label style={styles.label}>Refund Date</label>
                      <input style={styles.input} type="date" value={normalizeDateInputValue(depositDraft.refundDate)} onChange={(e) => updateDepositRecord({ refundDate: normalizeDateInputValue(e.target.value) })} />
                    </div>
                    <div>
                      <label style={styles.label}>Refund Amount</label>
                      <input style={styles.input} type="number" step="0.01" value={depositDraft.refundAmount} onChange={(e) => updateDepositRecord({ refundAmount: e.target.value })} />
                    </div>
                    <div>
                      <label style={styles.label}>Deductions Withheld</label>
                      <input style={styles.input} type="number" step="0.01" value={depositDraft.deductionAmount} onChange={(e) => updateDepositRecord({ deductionAmount: e.target.value })} />
                    </div>
                  </div>
                  <label style={styles.label}>Deduction Note</label>
                  <textarea style={styles.textarea} value={depositDraft.deductionNote} onChange={(e) => updateDepositRecord({ deductionNote: e.target.value })} placeholder="Damages, cleaning, unpaid balance, or other deductions." />
                  <div className="mobile-button-row" style={styles.buttonRow}>
                    <button style={styles.primaryButton} type="button" onClick={saveDepositRecord}>Save Deposit Details</button>
                  </div>
                </div>
              </>
            ) : (
              <div style={styles.notesBox}>Select a property to track its security deposit.</div>
            )}
          </div>

          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Alerts Center</h2>
                <p style={styles.smallMuted}>This flags the things most likely to need attention first.</p>
              </div>
              <div style={styles.alertSummaryInline}>
                <span style={styles.alertBadgeHigh}>{highAlertCount} high</span>
                <span style={styles.alertBadgeMedium}>{mediumAlertCount} medium</span>
                <span style={styles.alertBadgeLow}>{lowAlertCount} low</span>
              </div>
            </div>

            {companyAlerts.length === 0 ? (
              <div style={styles.notesBox}>No alerts right now for the selected company and month.</div>
            ) : (
              <div style={styles.alertList}>
                {companyAlerts.map((alert) => (
                  <div key={`full-${alert.id}`} style={styles.alertCard}>
                    <div style={styles.alertCardTopRow}>
                      <span style={alert.severity === 'high' ? styles.alertBadgeHigh : alert.severity === 'medium' ? styles.alertBadgeMedium : styles.alertBadgeLow}>
                        {alert.category}
                      </span>
                      <button
                        style={styles.linkButton}
                        type="button"
                        onClick={() => {
                          setSelectedNotesPropertyId(alert.propertyId || '')
                        }}
                      >
                        Link to notes
                      </button>
                    </div>
                    <div style={styles.alertCardTitle}>{alert.title}</div>
                    <div style={styles.smallMuted}>{alert.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'onboarding' && (
        <div className="responsive-section-grid" style={styles.sectionGrid}>
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Tenant Onboarding</h2>
                <p style={styles.smallMuted}>Enter the new-tenant details once, preview the lease package, then print/save it as a PDF for Adobe signatures.</p>
              </div>
            </div>

            <label style={styles.label}>Property</label>
            <select style={styles.input} value={leaseForm.propertyId} onChange={(e) => handleLeasePropertyChange(e.target.value)}>
              <option value="">Select property</option>
              {activeCompanyProperties.map((property) => (
                <option key={`lease-property-${property.id}`} value={property.id}>{property.address}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 223px)', gap: '12px', justifyContent: 'start', alignItems: 'end', overflowX: 'auto', paddingBottom: '4px' }}>
              <div>
                <label style={styles.label}>Tenant 1 Name</label>
                <input style={styles.input} value={leaseForm.tenantNames} onChange={(e) => updateLeaseForm({ tenantNames: e.target.value })} placeholder="Example: John Smith" />
              </div>
              <div>
                <label style={styles.label}>Tenant 1 Phone</label>
                <input style={styles.input} value={leaseForm.tenantPhone} onChange={(e) => updateLeaseForm({ tenantPhone: e.target.value })} placeholder="Cell phone for text receipts" />
              </div>
              <div>
                <label style={styles.label}>Tenant 1 Email</label>
                <input style={styles.input} type="email" value={leaseForm.tenantEmail} onChange={(e) => updateLeaseForm({ tenantEmail: e.target.value })} placeholder="Email address" />
              </div>

              <div style={{ gridColumn: '1 / span 1' }}>
                <label style={styles.label}>Tenant 2 Name</label>
                <input style={styles.input} value={leaseForm.tenant2Name} onChange={(e) => updateLeaseForm({ tenant2Name: e.target.value })} placeholder="Example: Jane Smith" />
              </div>
              <div>
                <label style={styles.label}>Tenant 2 Phone</label>
                <input style={styles.input} value={leaseForm.tenant2Phone} onChange={(e) => updateLeaseForm({ tenant2Phone: e.target.value })} placeholder="Optional second phone" />
              </div>
              <div>
                <label style={styles.label}>Tenant 2 Email</label>
                <input style={styles.input} type="email" value={leaseForm.tenant2Email} onChange={(e) => updateLeaseForm({ tenant2Email: e.target.value })} placeholder="Optional second email" />
              </div>

              <div style={{ gridColumn: '1 / span 1' }}>
                <label style={styles.label}>Occupants</label>
                <input style={styles.input} value={leaseForm.occupants} onChange={(e) => updateLeaseForm({ occupants: e.target.value })} placeholder="All approved occupants" />
              </div>
              <div style={{ gridColumn: '2 / span 3' }}>
                <label style={styles.label}>Contact / Tenant Notes</label>
                <input style={styles.input} value={leaseForm.tenantContactNotes} onChange={(e) => updateLeaseForm({ tenantContactNotes: e.target.value })} placeholder="Extra contact info, alternate numbers, best time to text, etc." />
              </div>

              <div style={{ gridColumn: '1 / span 1' }}>
                <label style={styles.label}>Lease Date</label>
                <input style={styles.input} type="date" value={normalizeDateInputValue(leaseForm.leaseDate)} onChange={(e) => updateLeaseForm({ leaseDate: normalizeDateInputValue(e.target.value) })} />
              </div>
              <div>
                <label style={styles.label}>Lease Start / Move-In Date</label>
                <input style={styles.input} type="date" value={normalizeDateInputValue(leaseForm.leaseStartDate)} onChange={(e) => handleLeaseStartDateChange(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Lease End Date</label>
                <input style={styles.input} type="date" value={normalizeDateInputValue(leaseForm.leaseEndDate)} onChange={(e) => updateLeaseForm({ leaseEndDate: normalizeDateInputValue(e.target.value) })} />
              </div>
              <div>
                <label style={styles.label}>Term (months)</label>
                <input style={styles.input} value={leaseForm.termMonths} onChange={(e) => updateLeaseForm({ termMonths: e.target.value })} />
              </div>
            </div>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Property Address</label>
                <input style={styles.input} value={leaseForm.propertyAddress} onChange={(e) => updateLeaseForm({ propertyAddress: e.target.value })} />
              </div>
              <div>
                <label style={styles.label}>State</label>
                <input style={styles.input} value={leaseForm.propertyState} onChange={(e) => updateLeaseForm({ propertyState: e.target.value })} />
              </div>
              <div>
                <label style={styles.label}>Zip</label>
                <input style={styles.input} value={leaseForm.propertyZip} onChange={(e) => updateLeaseForm({ propertyZip: e.target.value })} />
              </div>
            </div>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Rent Amount (net/on-time rent)</label>
                <input style={styles.input} type="number" step="0.01" value={leaseForm.monthlyRent} onChange={(e) => updateLeaseForm({ monthlyRent: e.target.value, grossRent: e.target.value ? String(Number(e.target.value || 0) + 50) : '' })} />
              </div>
              <div>
                <label style={styles.label}>Gross Rent Amount</label>
                <input style={styles.input} type="number" step="0.01" value={leaseForm.grossRent} onChange={(e) => updateLeaseForm({ grossRent: e.target.value })} />
              </div>
              <div>
                <label style={styles.label}>Prorated Rent</label>
                <input style={styles.input} type="number" step="0.01" value={leaseForm.proratedRent} onChange={(e) => updateLeaseForm({ proratedRent: e.target.value })} />
              </div>
              <div>
                <label style={styles.label}>Last Day of First Month</label>
                <input style={styles.input} type="date" value={normalizeDateInputValue(leaseForm.lastDayFirstMonth)} onChange={(e) => updateLeaseForm({ lastDayFirstMonth: normalizeDateInputValue(e.target.value) })} />
              </div>
              <div>
                <label style={styles.label}>Security Deposit</label>
                <input style={styles.input} type="number" step="0.01" value={leaseForm.depositAmount} onChange={(e) => updateLeaseForm({ depositAmount: e.target.value })} />
              </div>
            </div>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Pets?</label>
                <select style={styles.input} value={leaseForm.hasPets} onChange={(e) => updateLeaseForm({ hasPets: e.target.value })}>
                  <option value="no">No pets</option>
                  <option value="yes">Approved pet(s)</option>
                </select>
              </div>
              <div>
                <label style={styles.label}>Number of Pets</label>
                <input style={styles.input} value={leaseForm.numberOfPets} onChange={(e) => updateLeaseForm({ numberOfPets: e.target.value })} disabled={leaseForm.hasPets !== 'yes'} />
              </div>
              <div>
                <label style={styles.label}>Pet Name(s)</label>
                <input style={styles.input} value={leaseForm.petNames} onChange={(e) => updateLeaseForm({ petNames: e.target.value })} disabled={leaseForm.hasPets !== 'yes'} />
              </div>
              <div>
                <label style={styles.label}>Pet Deposit</label>
                <input style={styles.input} type="number" step="0.01" value={leaseForm.petDepositAmount} onChange={(e) => updateLeaseForm({ petDepositAmount: e.target.value })} disabled={leaseForm.hasPets !== 'yes'} />
              </div>
            </div>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Property Manager Name</label>
                <input style={styles.input} value={leaseForm.propertyManagerName} onChange={(e) => updateLeaseForm({ propertyManagerName: e.target.value })} />
              </div>
              <div>
                <label style={styles.label}>Property Manager Phone</label>
                <input style={styles.input} value={leaseForm.propertyManagerPhone} onChange={(e) => updateLeaseForm({ propertyManagerPhone: e.target.value })} />
              </div>
            </div>

            <div className="mobile-button-row" style={styles.buttonRow}>
              <button style={styles.primaryButton} type="button" onClick={() => saveLeaseRecord({ openPrint: true })}>Save Record & Print PDF</button>
              <button style={styles.secondaryButton} type="button" onClick={printLeasePackage}>Print Only</button>
              <button style={styles.secondaryButton} type="button" onClick={() => saveLeaseRecord({ openPrint: false })}>Save Record Only</button>
              <button style={styles.secondaryButton} type="button" onClick={() => setLeaseForm(buildLeaseOnboardingForm())}>Clear Form</button>
            </div>

            <div style={styles.notesBox}>
              <strong>Phase 2 note:</strong> Save the lease record before or when printing. After Adobe signatures are complete, upload the signed PDF below to attach it to the property and tenant record.
            </div>
          </div>

          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Saved Lease Records</h2>
                <p style={styles.smallMuted}>Upload the Adobe-signed PDF here after it comes back signed. Records are tied to the selected company/property.</p>
              </div>
            </div>

            {companyLeaseRecords.length === 0 ? (
              <p style={styles.mutedText}>No lease records saved yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {companyLeaseRecords.map((leaseRecord) => {
                  const property = companyProperties.find((item) => item.id === leaseRecord.property_id)
                  return (
                    <div key={leaseRecord.id} style={styles.notesBox}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <strong>{leaseRecord.tenant_names || 'Tenant not listed'}</strong>
                          <div style={styles.smallMuted}>{property?.address || leaseRecord.property_address || 'Property not listed'}</div>
                          <div style={styles.smallMuted}>
                            {formatDate(leaseRecord.lease_start_date)} - {formatDate(leaseRecord.lease_end_date)} · {currency(leaseRecord.monthly_rent)} rent · Status: {leaseRecord.status || 'draft'}
                          </div>
                          {Number(leaseRecord.prorated_rent || 0) > 0 ? (
                            <div style={styles.smallMuted}>Prorated move-in charge: {currency(leaseRecord.prorated_rent)} through {formatDate(leaseRecord.last_day_first_month)} {hasPostedOnboardingCharge(leaseRecord) ? '· Posted' : '· Not posted'}</div>
                          ) : null}
                          {Number(leaseRecord.deposit_amount || 0) > 0 || Number(leaseRecord.pet_deposit_amount || 0) > 0 ? (
                            <div style={styles.smallMuted}>Required deposits: {Number(leaseRecord.deposit_amount || 0) > 0 ? `Security ${currency(leaseRecord.deposit_amount)}` : ''}{Number(leaseRecord.deposit_amount || 0) > 0 && Number(leaseRecord.pet_deposit_amount || 0) > 0 ? ' · ' : ''}{Number(leaseRecord.pet_deposit_amount || 0) > 0 ? `Pet ${currency(leaseRecord.pet_deposit_amount)}` : ''}</div>
                          ) : (
                            <div style={styles.smallMuted}>No deposit amount saved on this lease record. Use Post Required Deposits if needed.</div>
                          )}
                          {leaseRecord.signed_file_name ? (
                            <div style={styles.smallMuted}>Signed file: {leaseRecord.signed_file_name}</div>
                          ) : null}
                        </div>
                        <div className="mobile-button-row" style={styles.buttonRow}>
                          <label style={styles.secondaryButton}>
                            {uploadingLeaseId === leaseRecord.id ? 'Uploading...' : 'Upload Signed PDF'}
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              style={{ display: 'none' }}
                              disabled={uploadingLeaseId === leaseRecord.id}
                              onChange={(e) => uploadSignedLease(leaseRecord, e.target.files?.[0])}
                            />
                          </label>
                          <button style={styles.secondaryButton} type="button" onClick={() => openSignedLease(leaseRecord)} disabled={!leaseRecord.signed_file_path}>Open Signed PDF</button>
                          <button style={styles.secondaryButton} type="button" onClick={() => markLeaseStatus(leaseRecord.id, 'sent')}>Mark Sent</button>
                          <button style={styles.secondaryButton} type="button" onClick={() => postOnboardingCharges(leaseRecord)}>Post Onboarding Charges</button>
                          <button style={styles.secondaryButton} type="button" onClick={() => postRequiredDeposits(leaseRecord)}>Post Required Deposits</button>
                          <button style={styles.dangerButton} type="button" onClick={() => deleteLeaseRecord(leaseRecord)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Lease Preview</h2>
                <p style={styles.smallMuted}>Review before printing. Your browser print dialog can save this as a PDF.</p>
              </div>
            </div>

            <div ref={leasePreviewRef}>
              <div className="lease-package">
                <section className="lease-page lease-formal-page">
                  <div className="lease-page-body">
                  <div className="lease-company-line"><span>{selectedCompanyName}</span><span>Date: <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span></span></div>
                  <h1 className="lease-title">RESIDENTIAL LEASE</h1>

                  <p className="lease-line"><span className="lease-section-title">PARTIES</span> <span className="lease-fill">{selectedCompanyName}</span> (hereinafter referred to as Lessor) hereby leases to <span className="lease-fill">{getLeaseTenantNamesForAgreement() || '________________'}</span> (hereinafter referred to as Lessee) the following described property:</p>
                  <p className="lease-line"><span className="lease-section-title">PREMISES</span> <span className="lease-fill">{leaseForm.propertyAddress || selectedLeaseProperty?.address || '________________'}</span>, <span className="lease-fill">{leaseForm.propertyState || 'LA'}</span> <span className="lease-fill">{leaseForm.propertyZip || '________'}</span>, for use by Lessee as a private residence only.</p>
                  <p className="lease-line"><span className="lease-section-title">TERM</span> This lease is for a term of <span className="lease-fill">{leaseForm.termMonths || '____'}</span> months commencing on the <span className="lease-fill">{getDayNumber(leaseForm.leaseStartDate)}</span> day of <span className="lease-fill">{getMonthYearLabel(leaseForm.leaseStartDate)}</span> and ending on the last calendar day of <span className="lease-fill">{getMonthLabelOnly(leaseForm.leaseEndDate)}</span>, <span className="lease-fill">{getYearLabelOnly(leaseForm.leaseEndDate)}</span>.</p>
                  <p className="lease-line"><span className="lease-section-title">MONTH TO MONTH RENEWAL</span> If Lessee, or Lessor, desires that this lease terminate at the expiration of its term he must give to the other party written notice at least 30 days prior to that date. Failure of either party to give this required notice automatically renews this lease and all of the terms thereof except that the lease will then be on a month-to-month basis.</p>
                  <p className="lease-line"><span className="lease-section-title">RENT</span> This lease is made for and in consideration of a monthly rental of <span className="lease-fill">{formatLeaseMoney(leaseForm.grossRent)}</span> dollars payable in advance on or before the 1st day of each month at PROPERTY MANAGER OR BY BANK DEPOSIT. Lessee agrees to pay Lessor the sum of <span className="lease-fill">{formatLeaseMoney(leaseForm.proratedRent)}</span> dollars which is prorated rental for the period <span className="lease-fill">{formatDate(leaseForm.moveInDate)}</span> thru <span className="lease-fill">{formatDate(leaseForm.lastDayFirstMonth)}</span>. If rent is paid by the <span className="lease-fill">5TH</span> of the month, Lessee shall be entitled to a deduction of $50.00 dollars per month, or a net rental of <span className="lease-fill">{formatLeaseMoney(leaseForm.monthlyRent)}</span> dollars per month provided, however, that if the rent due is not received by the <span className="lease-fill">5TH</span> of the month Lessee shall be considered delinquent. If Lessee pays by check and said check is not honored on presentation for any reason whatsoever, Lessee agrees to pay an additional sum of $50.00 as a penalty. This penalty provision is not to be considered a waiver or relinquishment of any of the other rights or remedies of Lessor. At Lessor's discretion after receipt of NSF check; Lessor may require all future payments in the form of money orders or certified funds. Lessor shall give written notice to Lessee of this requirement.</p>

                  <p className="lease-line"><span className="lease-section-title">SECURITY DEPOSIT</span> Upon execution of this lease, Lessee agrees to deposit with Lessor, the sum of $ <span className="lease-fill">{leaseForm.depositAmount || '________'}</span>. This deposit shall be non-interest bearing and is to be held by Lessor as security for the full and faithful performance of the terms and conditions of this lease. This security deposit is not an advance rental, and Lessee may not deduct portion of the deposit from rent due to Lessor. This security deposit is not to be considered liquidated damages. In the event of forfeiture of the security deposit due to Lessee's failure to fully and faithfully perform all of the terms and conditions of this lease, Lessor retains all of his other rights and remedies. Lessee does not have the right to cancel this lease and avoid his obligations hereunder by forfeiting said security deposit.</p>
                  <p className="lease-line">Deductions will be made from the security deposit to reimburse Lessor for the cost of repairing any damage to the premises or equipment or the cost of replacing any of the articles or equipment that may be damaged beyond repair, lost or missing at the termination of this lease. Deductions will also be made to cover any unpaid amounts owed to Lessor for any damage, loss, or charges occurring prior to termination of this lease and for which Lessee is responsible. In the event that damages or other charges exceed the amount of the security deposit, Lessee agrees to pay all expenses and cost to Lessor. In the event there has been a forfeiture of the security deposit, excess charges shall be paid in addition to the amount of the said security deposit.</p>
                  <p className="lease-line">Should there be any damage to the leased premises or equipment therein, reasonable wear and tear excepted, caused by Lessee, his family, guest or Agents, Lessee agrees to pay Lessor when billed the full amount necessary to repair or replace the damaged premises or equipment. This includes but is not limited to garbage disposal, plumbing problems due to improper usage, also water problems due to improper bath/shower usage.</p>
                  <p className="lease-line">Notwithstanding any other provisions expressed or implied herein, it is specifically understood and agreed that the entire security deposit aforesaid shall be automatically forfeited should Lessee vacate or abandon premises before the expiration of this lease, except where such abandonment occurs during the last month of the term of this lease, and Lessee has paid all rent covering the entire term and either party has given the other timely written notice that his lease will not be renewed under its automatic renewal provisions. Forfeiture of the security deposit shall not limit Lessor's rights nor Lessee's obligations.</p>
                  <p className="lease-line">The leased premises must be returned to the Lessor in as good condition as they were at the time the Lessee first occupied same, subject only to normal wear and tear. Lessor agrees to deliver the premises clean and free of trash at the beginning of this lease and Lessee agrees to return the same in like condition at the termination of this lease. At the termination of this lease, the Lessee shall be entitled to an accounting and a return of the security deposit within 30 days thereafter, providing all of the obligations of the lessee have been fulfilled, including return of the keys to the Lessor. Lessee shall provide Lessor with a forwarding address, in writing.</p>
                  <p className="lease-line"><span className="lease-section-title">OCCUPANTS</span> The leased premises shall be occupied only by the persons listed below. Other occupants, including temporary visitors, are not allowed to remain at the premises for a period in excess of 10 days.</p>
                  <p className="lease-line lease-occupants-line"><span className="lease-fill">{leaseForm.occupants || '________________'}</span></p>
                  <p className="lease-line">A temporary visitor is one who inhabits the premises for no more than ten (10) days.</p>
                  </div>
                  <div className="lease-page-footer"><div className="lease-initial-row"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSOR'S INITIALS</div><div className="lease-sign-line">LESSOR'S INITIALS</div></div></div>
                  <div className="lease-page-number">Page 1 of 7</div>
                </section>

                <section className="lease-page lease-formal-page lease-tight-page">
                  <div className="lease-page-body">
                  <p className="lease-line lease-page-meta"><strong>Property Address:</strong> <span className="lease-fill">{leaseForm.propertyAddress || selectedLeaseProperty?.address || '________________'}</span> <strong>Date:</strong> <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span></p>
                  <p className="lease-line"><span className="lease-section-title">PETS</span> {leaseForm.hasPets === 'yes' ? 'Pets are permitted only as specifically approved by written pet provision/addendum attached to this lease.' : 'No pets shall be allowed on the premises at any time. However, this provision shall not preclude Lessor modifying any lease to allow pets by mutual written agreement between Lessor and Lessee.'}</p>
                  <p className="lease-line"><span className="lease-section-title">SUB LEASE</span> Lessee is not permitted to sublet or grant use or possession of the leased premises without the written consent of Lessor and then only in accordance with the terms of this lease. Any expense associated with subleasing the premises shall be paid by NOT ALLOWED.</p>
                  <p className="lease-line"><span className="lease-section-title">DEFAULT, ABANDONMENT OR EVICTION</span> Should the Lessee fail to pay the rent or any other charges arising under this lease promptly as stipulated or should premises be abandoned by Lessee (it being agreed that an absence of Lessee from the leased premises for five consecutive days after rentals have become delinquent shall create a conclusive presumption of abandonment) or should Lessee begin to remove furniture or any substantial portion of Lessee's personal property to the detriment of Lessors lien, or should voluntary or involuntary bankruptcy proceedings be commenced by or against Lessee, or should Lessee make an assignment for the benefit of creditors, then in any of said events, Lessee shall be in default and the rental of the whole of the unexpired term of this lease, together with any attorney's fees, and all other expenses shall immediately become due. Lessor may proceed one or more times for past due installments without prejudging his rights to proceed later for the rent for the remaining term of this lease. Similarly, in the event of any such default, Lessor retains the option to cancel this lease and obtain possession of the premises in accordance with the provisions of Article 4701, et. seq. of the Louisiana Code of Civil Procedure. In the event of such cancellation and eviction, Lessee is obligated to pay any and all rent and expenses due and owing through the day said premises are re-rented or this lease expires, whichever is sooner. Lessee is obligated to pay any collection and eviction costs and attorney's fees. In the event the premises are abandoned as defined above, Lessee grants to Lessor the right to dispose of belongings remaining in the premises in any manner Lessor chooses without any responsibility or liability to Lessee for any loss which Lessee may sustain from said disposition. Lessee shall be responsible for any cost incurred by removal of these belongings.</p>
                  <p className="lease-line"><span className="lease-section-title">OTHER VIOLATIONS, NUISANCE</span> Should the Lessee at any time violate any of the conditions of this lease, other than the conditions provided in the immediately preceding paragraphs under the heading "Default, Abandonment, or Eviction" or should the Lessee discontinue the use of the premises for the purposes for which they are rented or fail to maintain a standard behavior consistent with the consideration necessary to provide reasonable safety, peace and quiet to others, such as but not limited to, being boisterous or disorderly, creating undue noise, disturbance or nuisance of any nature or knowingly engaging in any unlawful or immoral activities, or failure to abide by any Rules and Regulations, and should such violation continue for a period of five days after written notice has been given Lessee (such notice may be posted on Lessee's door) or should such violation again occur after written notice to cease and desist from such activity or disturbance, then, Lessee shall be in default and Lessor shall have the right to demand the rent for the whole unexpired term of this lease which at once becomes due and payable or to immediately cancel this lease and obtain possession of the premises in accordance with the provisions of Article 4701, et. seq. of Louisiana Code of Civil Procedure, or to exercise any further rights granted by this lease or available by law.</p>
                  <p className="lease-line"><span className="lease-section-title">RULES & REGULATIONS</span> Lessee acknowledges receipt of a copy of and agrees to comply with the Rules and Regulations. Lessee agrees to comply with any additions and/or modifications to these Rules & Regulations or with other Rules & Regulations which may be established, adopted by the Lessor and which may be posted on the leased premises, and/or mailed, and/or delivered to Lessee.</p>
                  <p className="lease-line"><span className="lease-section-title">CONDITION, REPAIRS, ADDITIONS AND ALTERATIONS OF PREMISES</span> Lessor warrants that the leased premises are in good condition. Lessor shall be responsible for the repair of electrical, plumbing, air conditioning and heating system provided the repair is not caused by misuse or neglect by the Lessee. Lessee agrees to use the same with care, and to perform the usual cleaning and household maintenance customarily required. Air conditioning and heating filters are the responsibility of Lessee. The running of the unit with dirty filters is not permitted. Lessee acknowledges that he has been provided with the opportunity to inspect the premises and accepts it in its current condition and agrees to keep it in same condition during the term of this lease at his expense and to return it to Lessor in the same or better condition at termination of this lease, normal decay, wear and tear excepted. The only exceptions to this area are repairs/improvements that Lessor specifically agrees to perform on the premises as may be outlined in the "SPECIAL CONDITIONS" section of this lease.</p>
                  <p className="lease-line">Lessee shall not make any additions or alterations to the premises without written permission of Lessor. Lessor or his employees shall have the right to enter the premises for the purpose of inspection or making repairs necessary for preservation of the property. Any additions or alterations made to the property by the Lessee shall become the property of the Lessor at the termination of this lease unless otherwise stipulated herein. Lessee expressly waives all right to compensation for any additions or alterations made to the premises. The Lessor, at his option, may require the premises to be returned to its original condition at Lessee's expense.</p>
                  <p className="lease-line"><span className="lease-section-title">OCCUPANCY</span> Should Lessor be unable to provide occupancy on the date of the beginning of this lease due to causes beyond control of Lessor, this lease shall not be affected thereby, but Lessee shall owe rent beginning only with the day on which he can obtain possession. Lessee shall not be entitled to any damages beyond the remission of rent for such term during which he is deprived of possession. Should Lessor be unable to provide occupancy within 10 calendar days from the commencement of this lease as stipulated herein, the Lessee shall have the option of terminating this lease by giving written notice to Lessor.</p>
                  <p className="lease-line">Should the property be destroyed or materially damaged so as to render it wholly unfit for occupancy by fire or other unforeseen event not due to any fault or neglect of Lessee, then Lessee shall be entitled to a refund of any prepaid rents for the unexpired term of the lease. However, Lessee shall not be entitled to a reduction of the monthly rent or cancellation of this lease because of a temporary failure of utilities, heat, air conditioning or temporary closing of swimming pool and/or a reasonable delay in completing agreed to improvements to the premises as specified in the "SPECIAL CONDITIONS" section of this lease.</p>
                  <p className="lease-line"><span className="lease-section-title">SURRENDER OF PREMISES</span> At the expiration of this lease, or its termination for other causes, Lessee is obligated to immediately surrender possession, and should Lessee fail to do so, he consents to pay any and all damages, but in no case less than five times the rent per day, plus attorney's fees, and other related costs.</p>
                  <p className="lease-line"><span className="lease-section-title">LIABILITY</span> If any employee or representative of Lessor renders any services (such as parking, washing or delivering automobiles, handling of furniture or other articles, cleaning the rented premises, package delivery, or any other service) for or at the request of Lessee, his family, employees or guests, then, for the purpose of such service, such employees shall be deemed the servant of Lessee, regardless of whether or not payment is arranged for such service, and Lessee agrees to release Lessor and his agents and/or representatives and to hold them harmless of any and all liability arising therefrom.</p>
                  <p className="lease-line">Neither Lessor nor his agents and/or representatives shall be liable to Lessee, or to Lessee's employees, patrons and visitors, or to any other person for any damage to person or property caused by any act, omission or neglect of Lessee or any other tenant of said leased premises and Lessee agrees to defend, indemnify and hold Lessor, his agents and/or representatives harmless from all claims for any such damage, whether the injury occurs on or off leased premises.</p>
                  </div>
                  <div className="lease-page-footer"><div className="lease-initial-row"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSOR'S INITIALS</div><div className="lease-sign-line">LESSOR'S INITIALS</div></div></div>
                  <div className="lease-page-number">Page 2 of 7</div>
                </section>

                <section className="lease-page lease-formal-page lease-tight-page">
                  <div className="lease-page-body">
                  <p className="lease-line lease-page-meta"><strong>Property Address:</strong> <span className="lease-fill">{leaseForm.propertyAddress || selectedLeaseProperty?.address || '________________'}</span> <strong>Date:</strong> <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span></p>
                  <p className="lease-line">Lessee hereby releases and holds Lessor, his agents and/or representatives harmless and agrees to defend and indemnify Lessor from any damage or injury to persons or property caused as a result of the use of the swimming pool by Lessee or any persons making use of said through the use, permission or consent of Lessee.</p>
                  <p className="lease-line">Lessee assumes responsibility for the condition of the premises. Lessor is not responsible for damage caused by leaks in the roof, bursting of pipes by freezing or otherwise, or any vices or defects of the leased property, or the consequences thereof, except in case of positive neglect or failure to take action toward the remedying of such defects within a reasonable amount of time after receiving written notice of such defects. Should lessee fail to promptly so notify Lessor in writing, of any such defects, Lessee will become responsible for any damage or claims resulting to Lessor or other parties.</p>
                  <p className="lease-line">Lessee understands that neither Lessor, his agents and/or representatives carries Hazard or Flood insurance on Lessee's contents in leased premises. Lessor is not responsible for damage or loss of Lessee's personal property. Lessor encourages lessee to acquire adequate insurance to protect themselves and their personal property.</p>
                  <p className="lease-line">Lessor and Lessee acknowledge that the return or disposition of Lessee's deposit is a decision made exclusively by the Lessor in accordance with the applicable rules of the Louisiana Real Estate Commission, the terms and conditions of this lease, and the requirements of law. Said parties acknowledge that the Lessor's agent is likewise bound to the applicable rules of the Louisiana Real Estate Commission and cannot return the deposit, if held by agent, in the absence of mutual written agreement except in accordance with the rules and regulations of the Louisiana Real Estate Commission. Accordingly, both Lessor and Lessee release and discharge said agent from any and all liability or responsibility of agent relating to the return of such deposit, except in the event agent breaches the rules and regulations of the Louisiana Real Estate Commission. Lessee acknowledges that the actions of the agent regarding this entire lease is made solely and at the direction of the Lessor.</p>
                  <p className="lease-line"><span className="lease-section-title">SIGNS & ACCESS</span> Lessor reserves the right to post on the premises "For Sale" signs at any time and "For Rent" signs can be placed on property N/A days prior to expiration of lease. Lessee will also permit Lessor, his agents and/or representatives to have access to the premises for the purpose of inspection, sale or leasing at reasonable intervals between the hours of 8:00 am to 8:00 pm. If Lessee refuses request for access, this shall constitute a violation of the lease.</p>
                  <p className="lease-line"><span className="lease-section-title">ATTORNEYS FEES</span> Lessee further agrees that if an Attorney is employed to protect the rights of the Lessor hereunder, Lessee will pay the fee of such attorney. Such fee is hereby fixed at twenty-five (25%) percent of the amount claimed or a minimum of $300.00 whichever is greater. Lessee further agrees to pay all court costs and sheriff's charges and all other expenses involved.</p>
                  <p className="lease-line"><span className="lease-section-title">NOTICES</span> All notices required to be given under the terms of this lease shall be in writing, and if mailed by certified mail addressed to Lessee at the herein leased premises or to Lessor at the address appearing in this lease, and such mailing constitutes full proof of and compliance with the requirement of notice, regardless of whether addressee received such notice or not. Notices may also be given in writing by hand delivery, or by attaching to door of premises.</p>
                  <p className="lease-line"><span className="lease-section-title">COMMISSIONS</span> Lessor, his heirs, successors or assigns, agrees to pay to N/A successors or assigns a lump sum cash commission of N/A which commission is earned and payable upon execution of this lease, and a similar commission on any extension or renewal of this lease and also a commission of N/A of the negotiated price of any agreement to sell, exchange or option made with or through Lessee during the term of this lease or any renewal and/or extension thereof or within 180 days after the expiration of this lease or any renewal thereof.</p>
                  <p className="lease-line">In consideration of services rendered by agent in negotiating this lease, Lessor hereby agrees that in the event the herein leased property is sold or transferred during the term of this lease and there are any unpaid commission still due agent, Lessor will pay same lump sum in cash at the time property is sold or transferred.</p>
                  <p className="lease-line"><span className="lease-section-title">OTHER CONDITIONS</span> The failure of Lessor to insist upon the strict performance of the terms, covenants, agreements and conditions hereby contained, or any of them, shall not constitute or be construed as a waiver or relinquishment of the Lessor's right thereafter to enforce any such terms, covenant, agreement and condition, but the same shall continue in full force and effect.</p>
                  <p className="lease-line">It is understood that the terms "Lessor" and "Lessee" are used in this lease, and they shall include the plural and shall apply to all persons, both male and female. All obligations of Lessee are joint, several and in solido.</p>
                  <p className="lease-line">This lease, whether or not recorded, shall be junior and subordinate to any mortgage hereafter placed by Lessor on the entire property of which the leased premises forms a part.</p>
                  <p className="lease-line"><span className="lease-section-title">UTILITIES</span> Lessee shall maintain all utility services, including water, gas, electricity, phone, garbage collection, and lawn and garden care, in Lessee's name and shall promptly pay all charges due thereon, during the term of this lease unless otherwise noted.</p>
                  <p className="lease-line"><span className="lease-section-title">WAIVER OF NOTICE</span> Upon termination of the right of occupancy for any reason, Lessee hereby expressly waives notice to vacate premises prior to institution of eviction proceedings in accordance with La. CCP Article 4701 and La. CC Article 2713.</p>
                  <p className="lease-line"><span className="lease-section-title">MISCELLANEOUS PROVISIONS</span> No cars to be parked on lawn or walkways. Cars to be parked only in designated areas. No holes shall be drilled in the walls, woodwork or floors are permitted. No painting or papering of walls is permitted without written consent of Lessor. Lessee shall not allow the cable/phone company to wire the premises for cable without Lessor's written permission. No waterbeds are allowed. No foil in windows is allowed. Garbage to be placed in designated receptacle. If no receptacle is provided, garbage is to be placed on curb as prescribed by law in a proper receptacle provided by Lessee. Lessee is to furnish Lessor with a list of deficiencies noted by Lessee at the time of occupancy. This is to be held by Lessor in case of dispute as to move-in condition of property.</p>
                  </div>
                  <div className="lease-page-footer"><div className="lease-initial-row"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSOR'S INITIALS</div><div className="lease-sign-line">LESSOR'S INITIALS</div></div></div>
                  <div className="lease-page-number">Page 3 of 7</div>
                </section>

                <section className="lease-page lease-formal-page">
                  <p className="lease-line lease-page-meta"><strong>Property Address:</strong> <span className="lease-fill">{leaseForm.propertyAddress || selectedLeaseProperty?.address || '________________'}</span> <strong>Date:</strong> <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span></p>
                  <p className="lease-line"><span className="lease-section-title">SPECIAL CONDITIONS</span> SEE RULES AND REGULATIONS.</p>
                  <p className="lease-line"><span className="lease-section-title">LEAD-BASED PAINT, ASBESTOS, RADON</span> Lessee is aware that the premises may contain lead based paint, asbestos, or other toxins which may cause serious injury or death if consumed or ingested into the human body, and lessee acknowledges that the "Protect Your Family From Lead in Your Home" pamphlet has been called to their attention with respect to notice and information of lead base paint. Having knowledge of these facts, Lessee agrees to maintain the premises in a reasonably safe condition, to report to Lessor any condition which may lead to damage or injury because of lead, asbestos or other toxins, and Lessee further agrees to assume the use and occupancy of the herein leased premises at his own risk and hereby releases Lessor, his agents and/or representatives from any claims relating to or sustained as a consequence thereof, and further agrees to hold harmless, defend and indemnify Lessor, his agents and/or representatives from any claims made by Lessee, residents of his household or others using the premises with the consent and permission of Lessee.</p>
                  <p className="lease-line"><strong>LESSOR:</strong> Were there any structures built on this property prior to 1978?  ☐ Yes   ☐ No   ☐ Unknown</p>
                  <p className="lease-line">If Yes or Unknown is checked, this Residential Lease is submitted with Lessor's Disclosure of Information on Lead-Based Paint and Lead-Based Paint Hazards Form dated __________.</p>
                  <div className="lease-initial-row compact"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line blank">&nbsp;</div><div className="lease-sign-line">LESSOR'S INITIALS</div></div>
                  <p className="lease-line"><span className="lease-section-title">MOLD RELATED HAZARDS NOTICE</span> An informational pamphlet regarding common mold related hazards that can affect real property is available at the EPA website http:www.epa.gov/iaq/molds/index.html. By initialing this section, Lessee acknowledges that the real estate agent has provided Lessee with the EPA website enabling Lessee to obtain information regarding common mold related hazards.</p>
                  <div className="lease-initial-row compact"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line blank">&nbsp;</div><div className="lease-sign-line blank">&nbsp;</div></div>
                  <p className="lease-line"><span className="lease-section-title">SEX OFFENDER AND CHILD PREDATOR REGISTRY NOTICE</span> The Louisiana Bureau of Criminal Identification and Information maintains a State Sex Offender and Child Predator Registry, which is a public access database of the locations of individuals required to register pursuant to LSA-R.S. 15:540 et seq. Sheriff's Department and Police Departments serving jurisdictions of 450,000 also maintain such information. The State Sex Offender and Child Predator Registry database can be accessed at www.lasocpr.lsp.org/socpr/ and contains address, pictures and conviction records for registered offenders. The database can be searched by zip code, city, Parish or by offender name. Information is also available by phone at 1-800-858-0551 or 225-925-6100 or mail at P.O. Box 66614, Mail Slip #18, Baton Rouge, Louisiana 70896. You can also email State Services at SOCP@dps.state.la.us for more information.</p>
                  <div className="lease-initial-row compact"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line blank">&nbsp;</div><div className="lease-sign-line blank">&nbsp;</div></div>
                  <p className="lease-line">Time is of the essence. This document and any indicated addendum contain this entire lease. If any part of this lease is or becomes contrary to law, the remainder of this lease shall be unaffected. Any changes must be agreed upon in writing, and signed by Lessor and Lessee.</p>
                  <p className="lease-line lease-warning">WE DO BUSINESS IN ACCORDANCE WITH FEDERAL FAIR HOUSING LAWS<br />FACSIMILE SIGNATURES ARE ACCEPTABLE AND BINDING AS ORIGINALS<br />THIS IS A BINDING LEGAL DOCUMENT. READ CAREFULLY BEFORE SIGNING.</p>
                  <div className="lease-signature-row"><div className="lease-sign-line">Lessee Signature / Date</div><div className="lease-sign-line">Lessee Signature / Date</div></div>
                  <div className="lease-signature-row"><div className="lease-sign-line">Lessor Signature / Date</div><div className="lease-sign-line blank">&nbsp;</div></div>
                  <p className="lease-line lease-repair-call"><strong>FOR REPAIRS/MAINTENANCE CALL:</strong> <span className="lease-fill">{leaseForm.propertyManagerName}</span> <span className="lease-fill">{leaseForm.propertyManagerPhone}</span></p>
                  <div className="lease-page-number">Page 4 of 7</div>
                </section>

                <section className="lease-page lease-addendum-page">
                  <p className="lease-line lease-page-meta"><strong>Property Address:</strong> <span className="lease-fill">{leaseForm.propertyAddress || selectedLeaseProperty?.address || '________________'} {leaseForm.propertyState} {leaseForm.propertyZip}</span> <strong>Lease Date:</strong> <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span></p>
                  <h2 className="lease-rules-title">RULES & REGULATIONS</h2>
                  <ol className="lease-rules-list">
                    <li>Landlord/Property Manager may inspect the home at any time. Semi-annual inspection is required.</li>
                    <li>Air filter must be changed monthly. Dryer vents/hoses must be cleaned after each use. Repairs needed due to these items will be at lessee's expense.</li>
                    <li>Do not place items in drains, toilets, or disposals that will cause clogs, including flushable wipes, paper towels, personal products. Repairs needed due to this will be at lessee's expense.</li>
                    <li>No modifications/alterations may be made to property without written consent of lessor, including painting/papering of walls. Painting samples must be approved.</li>
                    <li>Lessor is responsible for lawn maintenance. Yard must be kept neat and clean. Please do not leave personal items in common areas or in front of property that will hinder mowing and maintenance.</li>
                    <li>Lessee is responsible for pest control. Service providers must be lessor approved.</li>
                    <li>Vehicle repairs are prohibited in driveways/carports. Inoperable vehicles or parts of such may not be kept on property for more than 14 days.</li>
                    <li>No smoking of any kind inside the premises, including garages/sunrooms.</li>
                    <li>All utilities must be transferred into Lessee's name within 5 business days of occupancy.</li>
                    <li>Lessee may not use property in any fashion inconsistent with quiet neighborhood standards, including anything unsightly, hazardous, or noisy. Any covenant/deed restrictions must be upheld.</li>
                    <li>Lessee may not use property for business purposes unless zoned as such or without written consent of lessor.</li>
                    <li>Days of trash and garbage collection shall be followed in accordance with local ordinances. Containers must be removed from curb after collection. Containers must be covered and appropriate.</li>
                    <li>Any leaks, damage, necessary repairs must be reported to {leaseForm.propertyManagerName} at {leaseForm.propertyManagerPhone}. If not reported within 24 hours of occurrence, repairs will be at lessee's expense. All repairs must be done by lessor-approved service providers.</li>
                    <li>After hour emergencies should be reported as described above. Any dangerous or life-threatening situation should be reported to local authorities.</li>
                    <li>Carpet cleaning during lease period is lessee's responsibility. If damage is outside of normal wear and tear upon move out, lessee's security deposit will be charged accordingly.</li>
                    <li>Lessee should secure renter's insurance on personal belongings. Neither property management company nor lessor is responsible for loss/damage to personal property.</li>
                    <li>Lessee is responsible for replacement of all light bulbs/fluorescent tubes. Upon moving out, lessee's deposit will be charged $5 per missing or burned-out bulb/tube.</li>
                    <li>Lessee may not use barbecue pits, smokers, other cooking tools or fire pits under any covered area of property or near any structure which may be a melting, discoloration, smoke, or fire hazard.</li>
                    <li>Parking must take place on paved areas only. Grass may not be used for parking. Boats, RVs, campers, etc. may not be kept on property.</li>
                    <li>No aluminum foil may be placed on windows.</li>
                    <li>Any approved additions/alterations made to property by lessee become property of the lessor without compensation unless stated in a written agreement prior to alterations being made.</li>
                    <li>Antennae or satellite dishes may not be added to property without written consent of lessor.</li>
                    <li>No locks, keys, or garage door openers may be changed or added in any way without written consent of lessor.</li>
                    <li>Only 2 persons may reside in a bedroom.</li>
                    <li>Lessee will immediately notify management of any changes in residents, emails, phone numbers, income, or employment. Guests may not occupy home for more than 7 days without written consent. Lessee may not sub-let any portion of property.</li>
                    <li>Lessor is not responsible for accommodations needed due to repairs/maintenance, natural disaster, etc. Rents must be paid during these events unless otherwise agreed upon or according to lease.</li>
                    <li>In hazardous weather, lessees are responsible for following local, state, and federal advisories and taking appropriate precautions.</li>
                    <li>There is no smoking of any kind inside premises, including garages/sunrooms.</li>
                    <li>Any change in the number of pets from application must receive written approval of lessor.</li>
                    <li>Roommate agreements are suggested as lessor is not responsible for negotiations/conflicts between lessees. All lessees are responsible for all aspects of lease unless approved by lessor.</li>
                    <li>In the event of unforeseen situations, all final decisions are made at lessor's discretion.</li>
                    <li>Any violation, neglect, or failure to comply with any of the above regulations may result in financial responsibilities to lessee or termination of lease.</li>
                    <li>For purposes of this agreement, lessor shall be either owner or manager.</li>
                    <li>All communication regarding property/lease should be forwarded to the appropriate property manager of {selectedCompanyName}.</li>
                  </ol>
                  <div className="lease-page-footer"><div className="lease-initial-row"><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line">LESSEE'S INITIALS</div><div className="lease-sign-line blank">&nbsp;</div><div className="lease-sign-line blank">&nbsp;</div></div></div>
                  <div className="lease-page-number">Page 5 of 7</div>
                </section>

                <section className="lease-page lease-addendum-page">
                  <h2 className="lease-addendum-title">Disclaimer of Liability - Residents' Personal Property</h2>
                  <p>This Disclaimer hereby notifies that the Owners and Management of this property are not liable for loss or damage to any/all personal property belonging to Residents. It is the Resident's responsibility to safeguard and insure all personal property against loss or damage. This disclaimer includes but is not limited to theft or burglary, water damage, fire damage, electrical surges, and acts of nature.</p>
                  <h2 className="lease-addendum-title">Fire Safety Guidelines</h2>
                  <p><strong>IN CASE OF FIRE CALL 911 IMMEDIATELY.</strong> Report all fires no matter how small. Plan and practice an escape route. Know where your fire extinguisher is located and how to use it. Check your smoke detector regularly. Never risk your safety, call 911 immediately. After you are safe, call the property manager.</p>
                  <h2 className="lease-addendum-title">Safety Addendum</h2>
                  <p>Lessee hereby acknowledges that no representation whatsoever has been made by the Lessor, or anyone acting on behalf of the Lessor, that the Lessee, the lessee's property, the property or the community are protected under all circumstances against criminal acts.</p>
                  <p>Before signing the lease, Lessee has the option to inspect the property and determine that all door and window locks, the smoke alarm(s), the fire extinguisher, etc. are adequate and in proper working order, and Lessee agrees to inspect all such devices at least monthly and to notify management immediately in writing if any repairs to such devices are needed during Lessee's occupancy of the property.</p>
                  <p>Lessee agrees that no measures taken by Lessor shall ever be deemed to constitute a guarantee or assurance of the safety of Lessee. Lessee hereby assumes all risk and responsibility for Lessee's own safety and for the safety of Lessee's property.</p>
                  <h2 className="lease-addendum-title">Crime Free Lease Addendum</h2>
                  <p>Lessee, members of Lessee's household, Lessee's occupants, Lessee's guests, Lessee's invitees, or any other person given access by Lessee shall not engage in criminal activity, facilitate criminal activity, permit the property to be used for criminal activity, or engage in drug-related criminal activity. Violation shall be a material and irreparable violation of the lease and good cause for termination of tenancy.</p>
                  <h2 className="lease-addendum-title">Mold Information and Prevention Addendum</h2>
                  <p>Lessee acknowledges the importance of minimizing mold growth by keeping the dwelling clean, removing visible moisture, using air conditioning/heating with proper ventilation, and promptly reporting water leaks, water infiltration, mold, or HVAC issues in writing. Failure to promptly address leaks and moisture may encourage mold growth.</p>
                  <p><strong>Please read all policies and lease addendums carefully before signing.</strong></p>
                  <div className="lease-signature-row compact"><div className="lease-sign-line">Lessee Signature</div><div className="lease-sign-line">Lessee Signature</div></div>
                  <div className="lease-page-number">Page 6 of 7</div>
                </section>

                {leaseForm.hasPets === 'yes' ? (
                  <section className="lease-page lease-addendum-page pet-provision-page">
                    <div className="lease-page-body">
                    <div className="lease-company-line"><span>{selectedCompanyName}</span><span>Lease Date: {formatDate(leaseForm.leaseDate)}</span></div>
                    <h2 className="lease-addendum-title">Pet Provision</h2>
                    <p>Addendum to lease dated <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span>, between <span className="lease-fill">{selectedCompanyName}</span>, Lessor, and <span className="lease-fill">{getLeaseTenantNamesForAgreement() || '________________'}</span>, Lessee, for <span className="lease-fill">{leaseForm.propertyAddress || selectedLeaseProperty?.address || '________________'}</span>.</p>
                    <p>For and in consideration of an additional security deposit of $<span className="lease-fill">{leaseForm.petDepositAmount || '________'}</span> and additional monthly rental of $0.00, Lessee may have <span className="lease-fill">{leaseForm.numberOfPets || '____'}</span> pet(s), namely <span className="lease-fill">{leaseForm.petNames || '________________'}</span>, during the term of this lease.</p>
                    <p>It is specifically understood that this provision may be cancelled by Lessor giving five (5) days written notice to Lessee should Lessor determine that the pet is destructive to the premises or grounds, unduly noisy, disturbing, or menacing. Such cancellation shall not affect the main lease between the parties.</p>
                    <p>A minimum of $50 of security deposit will automatically be forfeited upon move-out for sanitizing. In the event the lease agreement is broken for any reason, no portion of the pet deposit will be returned.</p>
                    <p><strong>READ BEFORE SIGNING</strong></p>
                    <p>This <span className="lease-fill">{formatDate(leaseForm.leaseDate)}</span></p>
                    <div className="lease-signature-row"><div className="lease-sign-line">Agent for Lessor</div><div className="lease-sign-line">Lessee</div></div>
                    <div className="lease-signature-row"><div className="lease-sign-line blank">&nbsp;</div><div className="lease-sign-line">Lessee</div></div>
                    </div>
                    <div className="lease-page-number">Page 7 of 7</div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div style={styles.sectionGridSingle}>
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Reports</h2>
                <p style={styles.smallMuted}>Choose one report to view, print, save, or export.</p>
              </div>
            </div>
            <label style={styles.label}>Select Report</label>
            <select
              className="mobile-input"
              style={styles.input}
              value={selectedReportView}
              onChange={(e) => setSelectedReportView(e.target.value)}
            >
              <option value="owner">Owner Monthly Report</option>
              <option value="invoice">Property Management Fee Invoice</option>
              <option value="property">Property Statement</option>
              <option value="tenant">Tenant Statement</option>
              <option value="bankDeposits">Bank Deposit Reconciliation</option>
            </select>
          </div>

          {selectedReportView === 'owner' && (
          <div className="mobile-card" style={styles.card}>
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
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => saveSectionAsPdf(ownerReportRef, 'Owner Monthly Report')}
                >
                  Save / Download PDF
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
              <div style={styles.reportBrandShell}>
                <div style={styles.reportBrandTop}>
                  <div style={styles.reportBrandLogoWrap}>
                    <img src={reportLogoSrc} alt="Open Door Support" style={styles.reportBrandLogo} />
                  </div>
                  <div>
                    <div style={styles.reportBrandTitle}>Open Door Support</div>
                    <div style={styles.reportBrandSubtitle}>Property Management System</div>
                  </div>
                </div>
              </div>

              <div style={styles.reportPrintHeader}>
                <div style={styles.reportPrintCompany}>{selectedCompanyName}</div>
                <div style={styles.reportPrintTitle}>Owner Monthly Report</div>
                <div style={styles.reportPrintMeta}>
                  <strong>Reporting Month:</strong> {formatMonthYear(selectedMonth)}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Generated:</strong> {generatedOnLabel}
                </div>
              </div>

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
                    {filteredLedgerRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan="5">No matching properties for this report.</td>
                      </tr>
                    ) : (
                      filteredLedgerRows.map((row) => (
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

              <div style={styles.reportPrintFooter}>
                <span>{selectedCompanyName}</span>
                <span>Generated {generatedOnLabel}</span>
              </div>
            </div>
          </div>
          )}

          {selectedReportView === 'invoice' && (
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Property Management Fee Invoice</h2>
                <p style={styles.smallMuted}>{selectedCompanyName} — {formatMonthYear(selectedMonth)}</p>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(managementInvoiceRef, 'Property Management Fee Invoice')}
                >
                  Print Invoice
                </button>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => saveSectionAsPdf(managementInvoiceRef, 'Property Management Fee Invoice')}
                >
                  Save / Download PDF
                </button>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={emailManagementInvoice}
                >
                  Email Invoice
                </button>
              </div>
            </div>

            <div ref={managementInvoiceRef}>
              <div style={styles.reportBrandShell}>
                <div style={styles.reportBrandTop}>
                  <div style={styles.reportBrandLogoWrap}>
                    <img src={reportLogoSrc} alt="Open Door Support" style={styles.reportBrandLogo} />
                  </div>
                  <div>
                    <div style={styles.reportBrandTitle}>Open Door Support</div>
                    <div style={styles.reportBrandSubtitle}>Property Management System</div>
                  </div>
                </div>
              </div>

              <div style={styles.reportPrintHeader}>
                <div style={styles.reportPrintTitle}>Property Management Fee Invoice</div>
                <div style={styles.reportPrintMeta}>{formatMonthYear(selectedMonth)}</div>
                <div style={styles.reportPrintMeta}><strong>Billed To:</strong> {selectedCompanyName}</div>
                <div style={styles.reportPrintMeta}><strong>Invoice #:</strong> {getManagementInvoiceNumber()}</div>
                <div style={styles.reportPrintMeta}><strong>Generated:</strong> {generatedOnLabel}</div>
              </div>

              <div style={styles.invoiceSummaryGrid}>
                <div style={styles.invoiceSummaryCard}>
                  <div style={styles.invoiceSummaryLabel}>Collected Rent</div>
                  <div style={styles.invoiceSummaryValue}>{currency(totalCollected)}</div>
                </div>
                <div style={styles.invoiceSummaryCard}>
                  <div style={styles.invoiceSummaryLabel}>Management Fee Rate</div>
                  <div style={styles.invoiceSummaryValue}>10%</div>
                </div>
                <div style={styles.invoiceSummaryCard}>
                  <div style={styles.invoiceSummaryLabel}>Amount Due</div>
                  <div style={styles.invoiceSummaryValue}>{currency(managementFeeCollected)}</div>
                </div>
              </div>

              <div style={styles.notesBox}>
                <strong>Invoice Notes:</strong> Property management fee for {formatMonthYear(selectedMonth)} based on rent collected for {selectedCompanyName}.
              </div>

              <div style={styles.reportPrintFooter}>
                <span>Open Door Support</span>
                <span>Generated {generatedOnLabel}</span>
              </div>
            </div>
          </div>
          )}

          {(selectedReportView === 'property' || selectedReportView === 'tenant') && (
          <div className="mobile-card" style={styles.card}>
            <h2 style={styles.cardTitle}>Statement Filters</h2>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Property</label>
                <select
                  className="mobile-input"
                  style={styles.input}
                  value={selectedReportPropertyId}
                  onChange={(e) => setSelectedReportPropertyId(e.target.value)}
                >
                  <option value="">Select property</option>
                  {filteredPropertyOptions.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Tenant</label>
                <select
                  className="mobile-input"
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
                  className="mobile-input"
                  style={styles.input}
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>End Date</label>
                <input
                  className="mobile-input"
                  style={styles.input}
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          )}

          {selectedReportView === 'property' && (
          <div className="mobile-card" style={styles.card}>
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
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => saveSectionAsPdf(propertyStatementRef, 'Property Statement')}
                >
                  Save / Download PDF
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
                <div style={styles.reportPrintCompany}>{selectedCompanyName}</div>
                <div style={styles.reportPrintTitle}>Property Account Statement</div>
                <div style={styles.reportPrintMeta}>
                  <strong>Property:</strong> {selectedReportProperty ? selectedReportProperty.address : '—'}
                </div>
                {selectedPropertyStatementTenant ? (
                  <div style={styles.reportPrintMeta}>
                    <strong>Tenant:</strong> {selectedPropertyStatementTenant}
                  </div>
                ) : null}
                <div style={styles.reportPrintMeta}>
                  <strong>Date Range:</strong> {reportDateRangeLabel}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Generated:</strong> {generatedOnLabel}
                </div>
                {(selectedLedgerDepositSummary.requiredAmount || selectedLedgerDepositSummary.totalPaid || selectedLedgerDepositRecord.refundAmount || selectedLedgerDepositRecord.deductionAmount) ? (
                  <div style={styles.notesBox}>
                    <strong>Deposits:</strong> Security Required {currency(selectedLedgerDepositSummary.requiredAmount)} • Pet Required {currency(selectedLedgerDepositSummary.petRequiredAmount)} • Paid {currency(selectedLedgerDepositSummary.totalPaid)} • Balance Owed {currency(selectedLedgerDepositSummary.balanceOwed)}
                    {selectedLedgerDepositTenant ? (
                      <div style={styles.smallMuted}>Tenant: {selectedLedgerDepositTenant}</div>
                    ) : null}
                    {selectedLedgerDepositRecord.refundDate || selectedLedgerDepositRecord.refundAmount ? (
                      <div style={styles.smallMuted}>Refund: {selectedLedgerDepositRecord.refundDate ? formatDate(selectedLedgerDepositRecord.refundDate) : '—'} • {currency(selectedLedgerDepositRecord.refundAmount)}</div>
                    ) : null}
                    {selectedLedgerDepositRecord.deductionAmount || selectedLedgerDepositRecord.deductionNote ? (
                      <div style={styles.smallMuted}>Deductions: {currency(selectedLedgerDepositRecord.deductionAmount)}{selectedLedgerDepositRecord.deductionNote ? ` • ${selectedLedgerDepositRecord.deductionNote}` : ''}</div>
                    ) : null}
                  </div>
                ) : null}
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

              <div style={styles.reportPrintFooter}>
                <span>{selectedCompanyName}</span>
                <span>Generated {generatedOnLabel}</span>
              </div>
            </div>
          </div>
          )}

          {selectedReportView === 'tenant' && (
          <div className="mobile-card" style={styles.card}>
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
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => saveSectionAsPdf(tenantStatementRef, 'Tenant Statement')}
                >
                  Save / Download PDF
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
                <div style={styles.reportPrintCompany}>{selectedCompanyName}</div>
                <div style={styles.reportPrintTitle}>Tenant Account Statement</div>
                <div style={styles.reportPrintMeta}>
                  <strong>Tenant:</strong> {selectedTenantName || '—'}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Date Range:</strong> {reportDateRangeLabel}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Generated:</strong> {generatedOnLabel}
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

              <div style={styles.reportPrintFooter}>
                <span>{selectedCompanyName}</span>
                <span>Generated {generatedOnLabel}</span>
              </div>
            </div>
          </div>
          )}


          {selectedReportView === 'bankDeposits' && (
          <div className="mobile-card" style={styles.card}>
            <div style={styles.reportHeaderRow}>
              <div>
                <h2 style={styles.cardTitle}>Bank Deposit Reconciliation</h2>
                <p style={styles.smallMuted}>Bank Deposit payments only — for QuickBooks and bank reconciliation.</p>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(bankDepositReportRef, 'Bank Deposit Reconciliation Report')}
                >
                  Print Report
                </button>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => saveSectionAsPdf(bankDepositReportRef, 'Bank Deposit Reconciliation Report')}
                >
                  Save / Download PDF
                </button>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={exportBankDepositCsv}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div style={styles.statementFilterGrid}>
              <div>
                <label style={styles.label}>Report Period</label>
                <select
                  className="mobile-input"
                  style={styles.input}
                  value={selectedBankDepositPeriod}
                  onChange={(e) => setSelectedBankDepositPeriod(e.target.value)}
                >
                  <option value="month">Selected Month</option>
                  <option value="year">Selected Year</option>
                </select>
              </div>
              <div>
                <label style={styles.label}>Property</label>
                <select
                  className="mobile-input"
                  style={styles.input}
                  value={selectedBankDepositPropertyId}
                  onChange={(e) => setSelectedBankDepositPropertyId(e.target.value)}
                >
                  <option value="">All Properties</option>
                  {companyProperties.map((property) => (
                    <option key={`bank-deposit-property-${property.id}`} value={property.id}>{property.address}</option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={bankDepositReportRef}>
              <div style={styles.reportBrandShell}>
                <div style={styles.reportBrandTop}>
                  <div style={styles.reportBrandLogoWrap}>
                    <img src={reportLogoSrc} alt="Open Door Support" style={styles.reportBrandLogo} />
                  </div>
                  <div>
                    <div style={styles.reportBrandTitle}>Open Door Support</div>
                    <div style={styles.reportBrandSubtitle}>Property Management System</div>
                  </div>
                </div>
              </div>

              <div style={styles.reportPrintHeader}>
                <div style={styles.reportPrintCompany}>{selectedCompanyName}</div>
                <div style={styles.reportPrintTitle}>Bank Deposit Reconciliation Report</div>
                <div style={styles.reportPrintMeta}>
                  <strong>Period:</strong> {selectedBankDepositPeriod === 'year' ? String(selectedMonth || getCurrentMonthKey()).slice(0, 4) : formatMonthYear(selectedMonth)}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Property:</strong> {bankDepositReportPropertyLabel}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Included Method:</strong> Bank Deposit only
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Generated:</strong> {generatedOnLabel}
                </div>
              </div>

              <div style={styles.invoiceSummaryGrid}>
                <div style={styles.invoiceSummaryCard}>
                  <div style={styles.invoiceSummaryLabel}>Bank Deposit Count</div>
                  <div style={styles.invoiceSummaryValue}>{bankDepositReportRows.length}</div>
                </div>
                <div style={styles.invoiceSummaryCard}>
                  <div style={styles.invoiceSummaryLabel}>Total Bank Deposits</div>
                  <div style={styles.invoiceSummaryValue}>{currency(bankDepositReportTotal)}</div>
                </div>
                <div style={styles.invoiceSummaryCard}>
                  <div style={styles.invoiceSummaryLabel}>Property Filter</div>
                  <div style={styles.invoiceSummaryValue}>{selectedBankDepositPropertyId ? 'One Property' : 'All Properties'}</div>
                </div>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Property</th>
                      <th style={styles.th}>Method</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankDepositReportRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan="5">No bank deposit payments found for the selected period and property filter.</td>
                      </tr>
                    ) : (
                      bankDepositReportRows.map((payment) => (
                        <tr key={`bank-deposit-${payment.id}`}>
                          <td style={styles.td}>{formatDate(payment.payment_date)}</td>
                          <td style={styles.td}>{payment.propertyAddress}</td>
                          <td style={styles.td}>{payment.method || 'Bank Deposit'}</td>
                          <td style={styles.td}>{currency(payment.amount)}</td>
                          <td style={styles.td}>{payment.note || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={styles.reportTotals}>
                <div><strong>Total Bank Deposits:</strong> {currency(bankDepositReportTotal)}</div>
              </div>

              <div style={styles.notesBox}>
                <strong>Reconciliation Notes:</strong> This report includes only payments entered with the method Bank Deposit. Cash and other payment methods are excluded.
              </div>

              <div style={styles.reportPrintFooter}>
                <span>Open Door Support</span>
                <span>Generated {generatedOnLabel}</span>
              </div>
            </div>
          </div>
          )}
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
  headerActions: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid rgba(231, 212, 187, 0.22)' },
  topControls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' },
  searchSummaryBar: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #dbeafe', borderRadius: '12px', color: '#334155' },
  linkButton: { background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, padding: 0 },
  controlBlock: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px' },
  tabRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' },
  tabButton: { background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 },
  activeTabButton: { background: '#0f172a', color: '#2f102d', border: 'none', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 },
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
  dangerButton: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 },
  secondaryButton: { background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '12px', padding: '11px 16px', cursor: 'pointer', fontWeight: 600 },
  smallPrimaryButton: { background: '#0f172a', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  smallSecondaryButton: { background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  smallDangerButton: { background: '#c79b62', color: '#2f102d', border: '1px solid #b9894b', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  inlineToggleLabel: { display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' },
  activeBadge: { display: 'inline-block', background: '#ecfdf5', border: '1px solid #86efac', color: '#166534', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 },
  archivedBadge: { display: 'inline-block', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 },
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
  infoBanner: { marginTop: '12px', marginBottom: '16px', background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8', borderRadius: '12px', padding: '12px 14px', fontSize: '14px' },
  voiceCard: { marginTop: '16px', marginBottom: '16px', border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '14px', padding: '14px' },
  voiceHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' },
  voiceTitle: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' },
  voiceButtonGroup: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  voicePrimaryButton: { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 16px', fontWeight: 700, cursor: 'pointer', minHeight: '44px' },
  voiceDangerButton: { background: '#c79b62', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 16px', fontWeight: 700, cursor: 'pointer', minHeight: '44px' },
  voiceSecondaryButton: { background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 16px', fontWeight: 700, cursor: 'pointer', minHeight: '44px' },
  voiceHelpBox: { marginBottom: '12px', padding: '10px 12px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '14px', lineHeight: 1.4 },
  message: { marginTop: '16px', color: '#c79b62', fontSize: '14px' },
  messageBanner: { marginBottom: '18px', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: '12px', padding: '12px 14px', fontSize: '14px' },
  successBanner: { marginBottom: '16px', background: '#ecfdf5', border: '1px solid #86efac', color: '#166534', borderRadius: '12px', padding: '12px 14px', fontSize: '14px' },
  notesBox: { marginTop: '16px', background: '#fbf7f1', border: '1px solid #e8dccb', borderRadius: '12px', padding: '12px 14px', fontSize: '14px', color: '#4b5563' },
  reportPrintHeader: { marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #d9cfc0' },
  reportPrintCompany: { fontSize: '18px', fontWeight: 700, marginBottom: '6px', color: '#2f102d' },
  reportPrintTitle: { fontSize: '24px', fontWeight: 700, marginBottom: '6px', color: '#2f102d' },
  reportPrintMeta: { fontSize: '14px', color: '#4b5563', marginBottom: '4px' },
  reportPrintFooter: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #d9cfc0', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', color: '#6b7280', fontSize: '12px' },
  alertList: { display: 'grid', gap: '12px' },
  alertCard: { border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px', background: '#ffffff' },
  alertCardTopRow: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' },
  alertCardTitle: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' },
  alertSummaryInline: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  alertBadgeHigh: { display: 'inline-block', background: '#fef2f2', border: '1px solid #fca5a5', color: '#c79b62', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 },
  alertBadgeMedium: { display: 'inline-block', background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 },
  alertBadgeLow: { display: 'inline-block', background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 },
  notesCountPill: { display: 'inline-block', background: '#ecfeff', border: '1px solid #67e8f9', color: '#155e75', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 },
  notesMetaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '16px', marginBottom: '8px' },
  textarea: { width: '100%', minHeight: '180px', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '14px', fontFamily: 'Arial, sans-serif', resize: 'vertical' },
  reportBrandShell: { marginBottom: '14px', background: 'linear-gradient(135deg, #220821 0%, #4a1546 58%, #5a1a54 100%)', borderTop: '4px solid #d89a2b', borderRadius: '0', padding: '16px 18px', boxShadow: 'none' },
  reportBrandTop: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' },
  reportBrandLogoWrap: { background: '#f5ebdf', border: '1px solid rgba(231, 212, 187, 0.45)', borderRadius: '14px', padding: '8px 14px', width: '180px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' },
  reportBrandLogo: { width: '100%', maxWidth: '150px', objectFit: 'contain', display: 'block' },
  reportBrandTitle: { fontSize: '28px', lineHeight: 1.02, color: '#f5ebdf', fontFamily: 'Georgia, Times New Roman, serif', fontWeight: 700, letterSpacing: '-0.02em' },
  reportBrandSubtitle: { marginTop: '6px', color: '#e7d4bb', fontSize: '12px', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 },
  invoiceSummaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' },
  invoiceSummaryCard: { background: '#fffaf6', border: '1px solid #eadfce', borderRadius: '14px', padding: '14px' },
  invoiceSummaryLabel: { color: '#9a6d2f', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: '8px' },
  invoiceSummaryValue: { color: '#2f102d', fontSize: '24px', fontWeight: 700 },
}


Object.assign(styles, {
  page: { ...styles.page, background: '#f8f6f3', color: '#261525' },
  authPage: { ...styles.authPage, background: 'linear-gradient(180deg, #f8f6f3 0%, #f3ede7 100%)' },
  authCard: { ...styles.authCard, border: '1px solid #eadfce', borderRadius: '24px', boxShadow: '0 12px 34px rgba(71, 15, 67, 0.10)' },
  authLogoWrap: { display: 'flex', justifyContent: 'center', marginBottom: '18px' },
  authLogo: { width: '220px', maxWidth: '100%', objectFit: 'contain' },
  authTitle: { ...styles.authTitle, color: '#7b0f73', textAlign: 'center' },
  authSubtitle: { ...styles.authSubtitle, color: '#8c6d45', textAlign: 'center' },
  loadingCard: { ...styles.loadingCard, borderRadius: '20px', border: '1px solid #eadfce', boxShadow: '0 8px 24px rgba(71, 15, 67, 0.08)' },
  header: { ...styles.header, background: '#ffffff', border: '1px solid #eadfce', borderRadius: '22px', padding: '18px 20px', boxShadow: '0 10px 30px rgba(71, 15, 67, 0.08)' },
  brandTextColumn: { display: 'grid', gap: '18px', minWidth: 0, alignContent: 'center', padding: '8px 0' },
  logoPanel: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', minWidth: '350px', maxWidth: '420px', width: '100%' },
  brandHeaderLeft: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' },
  logoWrap: { background: '#fffaf6', border: '1px solid #eadfce', borderRadius: '18px', padding: '10px 12px' },
  logo: { width: '100%', maxWidth: '360px', height: 'auto', objectFit: 'contain', display: 'block' },
  title: { ...styles.title, color: '#7b0f73', fontSize: '28px' },
  subtitle: { ...styles.subtitle, color: '#c79b62', fontSize: '14px', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 },
  controlBlock: { ...styles.controlBlock, border: '1px solid #eadfce', borderRadius: '18px', boxShadow: '0 4px 14px rgba(71, 15, 67, 0.05)' },
  tabRow: { ...styles.tabRow, overflowX: 'auto', paddingBottom: '2px' },
  tabButton: { ...styles.tabButton, background: '#f1e7ef', color: '#5a1a54', border: '1px solid #e0cde0', borderRadius: '999px', fontWeight: 700, whiteSpace: 'nowrap' },
  activeTabButton: { ...styles.activeTabButton, background: '#7b0f73', border: '1px solid #7b0f73', borderRadius: '999px', boxShadow: '0 8px 18px rgba(123, 15, 115, 0.22)', whiteSpace: 'nowrap' },
  kpiCard: { ...styles.kpiCard, border: '1px solid #eadfce', borderRadius: '20px', boxShadow: '0 6px 18px rgba(71, 15, 67, 0.05)' },
  kpiLabel: { ...styles.kpiLabel, color: '#8c6d45', fontSize: '12px', letterSpacing: '.08em', fontWeight: 700 },
  kpiValue: { ...styles.kpiValue, color: '#381535' },
  kpiValueSmall: { ...styles.kpiValueSmall, color: '#381535' },
  card: { ...styles.card, border: '1px solid #eadfce', borderRadius: '22px', boxShadow: '0 8px 22px rgba(71, 15, 67, 0.05)' },
  cardTitle: { ...styles.cardTitle, color: '#381535' },
  label: { ...styles.label, color: '#5a1a54', fontWeight: 700 },
  input: { ...styles.input, border: '1px solid #d9c2cf', borderRadius: '14px', fontSize: '15px', color: '#261525' },
  tableInput: { ...styles.tableInput, border: '1px solid #d9c2cf', borderRadius: '12px', color: '#261525' },
  textarea: { ...styles.textarea, border: '1px solid #d9c2cf', borderRadius: '14px', color: '#261525' },
  primaryButton: { ...styles.primaryButton, background: '#7b0f73', borderRadius: '14px', boxShadow: '0 8px 18px rgba(123, 15, 115, 0.22)', fontWeight: 700 },
  dangerButton: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 },
  secondaryButton: { ...styles.secondaryButton, background: '#f3e7d7', color: '#5b3b18', border: '1px solid #e2c59c', borderRadius: '14px', fontWeight: 700 },
  smallPrimaryButton: { ...styles.smallPrimaryButton, background: '#7b0f73' },
  smallSecondaryButton: { ...styles.smallSecondaryButton, background: '#f3e7d7', color: '#5b3b18', border: '1px solid #e2c59c' },
  th: { ...styles.th, borderBottom: '1px solid #eadfce', color: '#8c6d45', textTransform: 'uppercase', letterSpacing: '.04em' },
  td: { ...styles.td, borderBottom: '1px solid #f0e6d9' },
  smallMuted: { ...styles.smallMuted, color: '#8c6d45' },
  voiceCard: { ...styles.voiceCard, background: 'linear-gradient(135deg, #fffaf6 0%, #f8ebf6 100%)', border: '1px solid #eadfce', borderRadius: '18px', boxShadow: '0 10px 26px rgba(71, 15, 67, 0.06)' },
  voiceTitle: { ...styles.voiceTitle, color: '#7b0f73' },
  voicePrimaryButton: { ...styles.voicePrimaryButton, background: '#7b0f73', borderRadius: '14px', boxShadow: '0 8px 18px rgba(123, 15, 115, 0.22)' },
  voiceDangerButton: { ...styles.voiceDangerButton, borderRadius: '14px' },
  voiceSecondaryButton: { ...styles.voiceSecondaryButton, background: '#f3e7d7', color: '#5b3b18', border: '1px solid #e2c59c', borderRadius: '14px' },
  voiceHelpBox: { ...styles.voiceHelpBox, background: '#fffaf6', border: '1px solid #eadfce', color: '#5b4a3b' },
  infoBanner: { ...styles.infoBanner, background: '#fffaf6', border: '1px solid #eadfce', color: '#5b4a3b' },
  searchSummaryBar: { ...styles.searchSummaryBar, background: '#fcf7f3', border: '1px solid #eadfce', color: '#4d2d4a' },
  linkButton: { ...styles.linkButton, color: '#7b0f73' },
  messageBanner: { ...styles.messageBanner, borderRadius: '14px' },
  successBanner: { ...styles.successBanner, borderRadius: '14px' },
  mobileHeroCard: { marginBottom: '16px', background: 'linear-gradient(135deg, #fffaf6 0%, #f8ebf6 100%)', border: '1px solid #eadfce', borderRadius: '24px', padding: '18px', boxShadow: '0 10px 26px rgba(71, 15, 67, 0.06)' },
  mobileHeroEyebrow: { color: '#c79b62', textTransform: 'uppercase', letterSpacing: '.09em', fontWeight: 700, fontSize: '12px', marginBottom: '8px' },
  mobileHeroTitle: { margin: '0 0 8px 0', color: '#7b0f73', fontSize: '28px', lineHeight: 1.1 },
  mobileHeroText: { margin: 0, color: '#5b4a3b', fontSize: '15px', lineHeight: 1.5 },
  receiptBox: { background: '#fffaf6', border: '1px solid #eadfce', borderRadius: '16px', padding: '12px', margin: '14px 0' },
  receiptPreview: { whiteSpace: 'pre-wrap', fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.45, background: '#ffffff', border: '1px solid #eadfce', borderRadius: '12px', padding: '10px', margin: '10px 0' },
  brandHeader: { ...styles.header, background: 'linear-gradient(135deg, #220821 0%, #4a1546 58%, #5a1a54 100%)', border: '1px solid #5b2a58', borderTop: '4px solid #d89a2b', borderRadius: '22px', padding: '22px 24px', boxShadow: '0 14px 34px rgba(34, 8, 33, 0.28)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '22px', alignItems: 'stretch' },
  brandHeaderLeft: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' },
  logoWrap: { background: '#f5ebdf', border: '1px solid rgba(231, 212, 187, 0.45)', borderRadius: '18px', padding: '8px 16px', boxSizing: 'border-box', width: '100%', height: '108px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', maxWidth: '360px', height: 'auto', objectFit: 'contain', display: 'block' },
  brandTitle: { margin: 0, fontSize: '34px', lineHeight: 1.04, color: '#f5ebdf', fontFamily: 'Georgia, Times New Roman, serif', fontWeight: 700, letterSpacing: '-0.02em' },
  brandSubtitle: { margin: '10px 0 0 0', color: '#e7d4bb', fontSize: '14px', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }
})
