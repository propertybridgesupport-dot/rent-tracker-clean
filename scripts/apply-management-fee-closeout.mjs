import fs from 'node:fs'

const path = 'src/App.jsx'
let source = fs.readFileSync(path, 'utf8')

if (source.includes('const [managementFeeInvoices, setManagementFeeInvoices]')) {
  console.log('Management fee closeout is already applied.')
  process.exit(0)
}

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Could not find ${label}`)
  source = source.replace(find, replacement)
}

replaceOnce(
  "  const [monthlyOverrides, setMonthlyOverrides] = useState([])\n",
  "  const [monthlyOverrides, setMonthlyOverrides] = useState([])\n  const [managementFeeInvoices, setManagementFeeInvoices] = useState([])\n  const [managementFeeInvoiceItems, setManagementFeeInvoiceItems] = useState([])\n  const [managementFeeCutoffDate, setManagementFeeCutoffDate] = useState(getTodayDateInput())\n  const [closingManagementFee, setClosingManagementFee] = useState(false)\n",
  'management fee state insertion point'
)

replaceOnce(
`      { data: depositProfileData, error: depositProfileError },
      { data: depositPaymentData, error: depositPaymentError },
    ] = await Promise.all([
`,
`      { data: depositProfileData, error: depositProfileError },
      { data: depositPaymentData, error: depositPaymentError },
      { data: managementFeeInvoiceData, error: managementFeeInvoiceError },
      { data: managementFeeItemData, error: managementFeeItemError },
    ] = await Promise.all([
`,
  'management fee load destructuring'
)

replaceOnce(
`      supabase.from('security_deposits').select('*').order('created_at', { ascending: true }),
      supabase.from('security_deposit_payments').select('*').order('payment_date', { ascending: true }),
    ])
`,
`      supabase.from('security_deposits').select('*').order('created_at', { ascending: true }),
      supabase.from('security_deposit_payments').select('*').order('payment_date', { ascending: true }),
      supabase.from('management_fee_invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('management_fee_invoice_items').select('*').order('payment_date', { ascending: true }),
    ])
`,
  'management fee load queries'
)

replaceOnce(
`    if (depositProfileError) console.error('Security deposit profile load failed.', depositProfileError)
    if (depositPaymentError) console.error('Security deposit payment load failed.', depositPaymentError)
`,
`    if (depositProfileError) console.error('Security deposit profile load failed.', depositProfileError)
    if (depositPaymentError) console.error('Security deposit payment load failed.', depositPaymentError)
    if (managementFeeInvoiceError) console.error('Management fee invoice load failed.', managementFeeInvoiceError)
    if (managementFeeItemError) console.error('Management fee invoice item load failed.', managementFeeItemError)
`,
  'management fee load errors'
)

replaceOnce(
`    const safeDepositProfiles = depositProfileData || []
    const safeDepositPayments = depositPaymentData || []
`,
`    const safeDepositProfiles = depositProfileData || []
    const safeDepositPayments = depositPaymentData || []
    const safeManagementFeeInvoices = managementFeeInvoiceData || []
    const safeManagementFeeItems = managementFeeItemData || []
`,
  'management fee safe data'
)

replaceOnce(
`    setMonthlyOverrides(safeOverrides)
    setSecurityDeposits(buildSecurityDepositMap(safeDepositProfiles, safeDepositPayments))
`,
`    setMonthlyOverrides(safeOverrides)
    setSecurityDeposits(buildSecurityDepositMap(safeDepositProfiles, safeDepositPayments))
    setManagementFeeInvoices(safeManagementFeeInvoices)
    setManagementFeeInvoiceItems(safeManagementFeeItems)
`,
  'management fee state assignment'
)

replaceOnce(
`  const managementFeeCollected = totalCollected * 0.1

  function printOwnerReport() {
`,
`  const managementFeeCollected = totalCollected * 0.1
  const managementFeeRate = 0.1

  const companyManagementFeeInvoices = useMemo(() => {
    return managementFeeInvoices.filter((invoice) => invoice.company_id === selectedCompanyId)
  }, [managementFeeInvoices, selectedCompanyId])

  const invoicedManagementFeePaymentIds = useMemo(() => {
    const companyInvoiceIds = new Set(companyManagementFeeInvoices.map((invoice) => invoice.id))
    return new Set(
      managementFeeInvoiceItems
        .filter((item) => companyInvoiceIds.has(item.invoice_id))
        .map((item) => item.payment_id)
        .filter(Boolean)
    )
  }, [managementFeeInvoiceItems, companyManagementFeeInvoices])

  const managementFeePreviewPayments = useMemo(() => {
    const cutoff = normalizeDateInputValue(managementFeeCutoffDate) || getTodayDateInput()
    const selectedMonthEnd = endOfMonth(selectedMonth)
    const effectiveCutoff = cutoff < selectedMonthEnd ? cutoff : selectedMonthEnd

    return companyPayments
      .filter((payment) => !isManualLateFeeEntry(payment))
      .filter((payment) => Number(payment.amount || 0) > 0)
      .filter((payment) => String(payment.payment_date || '').slice(0, 10) <= effectiveCutoff)
      .filter((payment) => !invoicedManagementFeePaymentIds.has(payment.id))
      .sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')))
  }, [companyPayments, managementFeeCutoffDate, selectedMonth, invoicedManagementFeePaymentIds])

  const managementFeePreviewGroups = useMemo(() => {
    const groups = new Map()
    managementFeePreviewPayments.forEach((payment) => {
      const paymentMonth = monthKeyFromDate(payment.payment_date) || selectedMonth
      const current = groups.get(paymentMonth) || { month: paymentMonth, collected: 0, fee: 0, payments: [] }
      const amount = Number(payment.amount || 0)
      current.collected += amount
      current.fee += amount * managementFeeRate
      current.payments.push(payment)
      groups.set(paymentMonth, current)
    })
    return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [managementFeePreviewPayments, selectedMonth])

  const priorManagementFeeGroups = managementFeePreviewGroups.filter((group) => group.month < selectedMonth)
  const currentManagementFeeGroups = managementFeePreviewGroups.filter((group) => group.month === selectedMonth)
  const priorManagementFeeBalance = priorManagementFeeGroups.reduce((sum, group) => sum + group.fee, 0)
  const currentManagementFeeDue = currentManagementFeeGroups.reduce((sum, group) => sum + group.fee, 0)
  const managementFeeInvoiceCollected = managementFeePreviewGroups.reduce((sum, group) => sum + group.collected, 0)
  const managementFeeInvoiceDue = priorManagementFeeBalance + currentManagementFeeDue

  const companyManagementFeeHistory = useMemo(() => {
    return companyManagementFeeInvoices
      .slice()
      .sort((a, b) => String(b.cutoff_date || b.created_at || '').localeCompare(String(a.cutoff_date || a.created_at || '')))
  }, [companyManagementFeeInvoices])

  async function closeOutManagementFeeInvoice() {
    if (!selectedCompanyId) {
      setMessage('Please select a company first.')
      return
    }
    if (managementFeePreviewPayments.length === 0) {
      setMessage('There are no uninvoiced rent payments through this cutoff date.')
      return
    }

    const cutoffDate = normalizeDateInputValue(managementFeeCutoffDate)
    if (!cutoffDate) {
      setMessage('Please enter a valid management fee cutoff date.')
      return
    }

    const confirmed = window.confirm(
      \`Close out management fees through \${formatDate(cutoffDate)}?\\n\\n\` +
      \`\${managementFeePreviewPayments.length} payment\${managementFeePreviewPayments.length === 1 ? '' : 's'} will be marked as invoiced for \${currency(managementFeeInvoiceDue)}.\`
    )
    if (!confirmed) return

    setClosingManagementFee(true)
    setMessage('')

    const invoiceNumber = \`\${getManagementInvoiceNumber()}-\${cutoffDate.replaceAll('-', '')}\`
    const { data: invoice, error: invoiceError } = await supabase
      .from('management_fee_invoices')
      .insert({
        company_id: selectedCompanyId,
        invoice_month: selectedMonth,
        invoice_number: invoiceNumber,
        cutoff_date: cutoffDate,
        fee_rate: managementFeeRate,
        collected_amount: managementFeeInvoiceCollected,
        fee_amount: managementFeeInvoiceDue,
        status: 'closed',
      })
      .select('*')
      .single()

    if (invoiceError || !invoice) {
      setClosingManagementFee(false)
      setMessage(invoiceError?.message || 'Unable to create management fee invoice.')
      return
    }

    const itemRows = managementFeePreviewPayments.map((payment) => ({
      invoice_id: invoice.id,
      payment_id: payment.id,
      property_id: payment.property_id,
      payment_month: monthKeyFromDate(payment.payment_date),
      payment_date: payment.payment_date,
      collected_amount: Number(payment.amount || 0),
      fee_amount: Number(payment.amount || 0) * managementFeeRate,
    }))

    const { error: itemError } = await supabase.from('management_fee_invoice_items').insert(itemRows)
    if (itemError) {
      await supabase.from('management_fee_invoices').delete().eq('id', invoice.id)
      setClosingManagementFee(false)
      setMessage(itemError.message)
      return
    }

    await loadData()
    setClosingManagementFee(false)
    setMessage(\`Management fee invoice closed through \${formatDate(cutoffDate)} for \${currency(managementFeeInvoiceDue)}.\`)
  }

  function printOwnerReport() {
`,
  'management fee calculations and closeout function'
)

replaceOnce(
`      \`Collected Rent: \${currency(totalCollected)}\`,
      \`Management Fee Rate: 10%\`,
      \`Amount Due: \${currency(managementFeeCollected)}\`,
`,
`      \`Uninvoiced Rent Collected: \${currency(managementFeeInvoiceCollected)}\`,
      \`Previous Balance: \${currency(priorManagementFeeBalance)}\`,
      \`Current Month Fee: \${currency(currentManagementFeeDue)}\`,
      \`Management Fee Rate: 10%\`,
      \`Amount Due: \${currency(managementFeeInvoiceDue)}\`,
      ...priorManagementFeeGroups.map((group) => \`Prior balance from \${formatMonthYear(group.month)} late collections: \${currency(group.fee)}\`),
`,
  'management fee email totals'
)

replaceOnce(
`              <div style={styles.actionRow}>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(managementInvoiceRef, 'Property Management Fee Invoice')}
                >
`,
`              <div style={styles.actionRow}>
                <label style={{ ...styles.label, marginBottom: 0 }}>
                  Closeout through
                  <input
                    type="date"
                    style={{ ...styles.input, width: 170, marginLeft: 8 }}
                    value={managementFeeCutoffDate}
                    onChange={(e) => setManagementFeeCutoffDate(e.target.value)}
                  />
                </label>
                <button
                  style={styles.smallPrimaryButton}
                  type="button"
                  onClick={closeOutManagementFeeInvoice}
                  disabled={closingManagementFee || managementFeePreviewPayments.length === 0}
                >
                  {closingManagementFee ? 'Closing…' : 'Close Out & Record Invoice'}
                </button>
                <button
                  style={styles.smallSecondaryButton}
                  type="button"
                  onClick={() => printSection(managementInvoiceRef, 'Property Management Fee Invoice')}
                >
`,
  'management fee invoice controls'
)

replaceOnce(
`                  <div style={styles.invoiceSummaryLabel}>Collected Rent</div>
                  <div style={styles.invoiceSummaryValue}>{currency(totalCollected)}</div>
`,
`                  <div style={styles.invoiceSummaryLabel}>Uninvoiced Collections</div>
                  <div style={styles.invoiceSummaryValue}>{currency(managementFeeInvoiceCollected)}</div>
`,
  'management fee collected summary'
)

replaceOnce(
`                  <div style={styles.invoiceSummaryLabel}>Amount Due</div>
                  <div style={styles.invoiceSummaryValue}>{currency(managementFeeCollected)}</div>
`,
`                  <div style={styles.invoiceSummaryLabel}>Amount Due</div>
                  <div style={styles.invoiceSummaryValue}>{currency(managementFeeInvoiceDue)}</div>
`,
  'management fee amount due summary'
)

replaceOnce(
`              <div style={styles.notesBox}>
                <strong>Invoice Notes:</strong> Property management fee for {formatMonthYear(selectedMonth)} based on rent collected for {selectedCompanyName}.
              </div>
`,
`              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Fee Period</th>
                      <th style={styles.th}>Description</th>
                      <th style={styles.th}>Rent Collected</th>
                      <th style={styles.th}>Fee Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managementFeePreviewGroups.length === 0 ? (
                      <tr><td style={styles.td} colSpan="4">No uninvoiced rent payments through the selected cutoff date.</td></tr>
                    ) : managementFeePreviewGroups.map((group) => (
                      <tr key={\`management-fee-\${group.month}\`}>
                        <td style={styles.td}>{formatMonthYear(group.month)}</td>
                        <td style={styles.td}>{group.month < selectedMonth ? \`Previous balance — late collections from \${formatMonthYear(group.month)}\` : \`\${formatMonthYear(group.month)} management fee\`}</td>
                        <td style={styles.td}>{currency(group.collected)}</td>
                        <td style={styles.td}>{currency(group.fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.reportTotals}>
                <div><strong>Previous Balance:</strong> {currency(priorManagementFeeBalance)}</div>
                <div><strong>{formatMonthYear(selectedMonth)} Fee:</strong> {currency(currentManagementFeeDue)}</div>
                <div><strong>Total Due:</strong> {currency(managementFeeInvoiceDue)}</div>
              </div>

              <div style={styles.notesBox}>
                <strong>Invoice Notes:</strong> Includes all uninvoiced rent payments received through {formatDate(managementFeeCutoffDate)}. Once closed, those payments will not be billed again. Payments received afterward will carry to the next invoice under their original collection month.
              </div>

              {companyManagementFeeHistory.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ marginBottom: 8 }}>Closeout History</h3>
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>
                      <thead><tr><th style={styles.th}>Invoice</th><th style={styles.th}>Cutoff</th><th style={styles.th}>Invoice Month</th><th style={styles.th}>Fee</th></tr></thead>
                      <tbody>
                        {companyManagementFeeHistory.slice(0, 12).map((invoice) => (
                          <tr key={invoice.id}>
                            <td style={styles.td}>{invoice.invoice_number}</td>
                            <td style={styles.td}>{formatDate(invoice.cutoff_date)}</td>
                            <td style={styles.td}>{formatMonthYear(invoice.invoice_month)}</td>
                            <td style={styles.td}>{currency(invoice.fee_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
`,
  'management fee breakdown and history'
)

fs.writeFileSync(path, source)
console.log('Applied management fee closeout changes to src/App.jsx')
