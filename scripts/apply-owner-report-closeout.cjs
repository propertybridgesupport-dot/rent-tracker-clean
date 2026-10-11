const fs = require('fs')

const path = 'src/App.jsx'
let s = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function replaceOnce(oldText, newText, label) {
  const count = s.split(oldText).length - 1
  if (count !== 1) {
    throw new Error(label + ': expected exactly 1 match, found ' + count)
  }
  s = s.replace(oldText, newText)
}

replaceOnce(
`  const companyManagementFeeHistory = useMemo(() => {
    return companyManagementFeeInvoices
      .slice()
      .sort((a, b) => String(b.cutoff_date || b.created_at || '').localeCompare(String(a.cutoff_date || a.created_at || '')))
  }, [companyManagementFeeInvoices])

  async function closeOutManagementFeeInvoice() {`,
`  const companyManagementFeeHistory = useMemo(() => {
    return companyManagementFeeInvoices
      .slice()
      .sort((a, b) => String(b.cutoff_date || b.created_at || '').localeCompare(String(a.cutoff_date || a.created_at || '')))
  }, [companyManagementFeeInvoices])

  const ownerReportSelectedCloseout = useMemo(() => {
    return companyManagementFeeInvoices
      .filter((invoice) => (
        invoice.invoice_month === selectedMonth &&
        String(invoice.status || 'closed').toLowerCase() === 'closed' &&
        invoice.cutoff_date
      ))
      .slice()
      .sort((a, b) => String(b.cutoff_date).localeCompare(String(a.cutoff_date)))[0] || null
  }, [companyManagementFeeInvoices, selectedMonth])

  const ownerReportPriorCloseout = useMemo(() => {
    return companyManagementFeeInvoices
      .filter((invoice) => (
        invoice.invoice_month < selectedMonth &&
        String(invoice.status || 'closed').toLowerCase() === 'closed' &&
        invoice.cutoff_date
      ))
      .slice()
      .sort((a, b) => String(b.cutoff_date).localeCompare(String(a.cutoff_date)))[0] || null
  }, [companyManagementFeeInvoices, selectedMonth])

  const ownerReportPeriodStart = useMemo(() => {
    if (!ownerReportPriorCloseout?.cutoff_date) return startOfMonth(selectedMonth)

    const cutoff = normalizeDateInputValue(ownerReportPriorCloseout.cutoff_date)
    if (!cutoff) return startOfMonth(selectedMonth)

    const [year, month, day] = cutoff.split('-').map(Number)
    const nextDay = new Date(year, month - 1, day + 1)
    return \`\${nextDay.getFullYear()}-\${String(nextDay.getMonth() + 1).padStart(2, '0')}-\${String(nextDay.getDate()).padStart(2, '0')}\`
  }, [ownerReportPriorCloseout, selectedMonth])

  const ownerReportPeriodEnd = useMemo(() => {
    if (ownerReportSelectedCloseout?.cutoff_date) {
      return normalizeDateInputValue(ownerReportSelectedCloseout.cutoff_date)
    }

    const currentMonth = getCurrentMonthKey()
    if (selectedMonth < currentMonth) return endOfMonth(selectedMonth)
    if (selectedMonth > currentMonth) return endOfMonth(selectedMonth)

    const today = getTodayDateInput()
    const monthEnd = endOfMonth(selectedMonth)
    return today < monthEnd ? today : monthEnd
  }, [ownerReportSelectedCloseout, selectedMonth])

  const ownerReportPayments = useMemo(() => {
    return companyPayments
      .filter((payment) => !isManualLateFeeEntry(payment))
      .filter((payment) => Number(payment.amount || 0) > 0)
      .filter((payment) => {
        const paymentDate = normalizeDateInputValue(payment.payment_date)
        return paymentDate && paymentDate >= ownerReportPeriodStart && paymentDate <= ownerReportPeriodEnd
      })
      .sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')))
  }, [companyPayments, ownerReportPeriodStart, ownerReportPeriodEnd])

  const ownerReportPaymentMap = useMemo(() => {
    const map = new Map()

    ownerReportPayments.forEach((payment) => {
      const current = map.get(payment.property_id) || {
        total: 0,
        carryIn: 0,
        paymentDates: [],
      }

      const amount = Number(payment.amount || 0)
      const paymentDate = normalizeDateInputValue(payment.payment_date)
      current.total += amount

      if (monthKeyFromDate(payment.payment_date) < selectedMonth) {
        current.carryIn += amount
      }

      if (paymentDate && !current.paymentDates.includes(paymentDate)) {
        current.paymentDates.push(paymentDate)
      }

      map.set(payment.property_id, current)
    })

    return map
  }, [ownerReportPayments, selectedMonth])

  const ownerReportRows = useMemo(() => {
    return filteredLedgerRows.map((row) => {
      const paymentSummary = ownerReportPaymentMap.get(row.id) || {
        total: 0,
        carryIn: 0,
        paymentDates: [],
      }

      return {
        ...row,
        ownerReportCollected: paymentSummary.total,
        ownerReportCarryIn: paymentSummary.carryIn,
        ownerReportPaymentDates: paymentSummary.paymentDates,
      }
    })
  }, [filteredLedgerRows, ownerReportPaymentMap])

  const ownerReportTotalCollected = ownerReportRows.reduce(
    (sum, row) => sum + Number(row.ownerReportCollected || 0),
    0
  )
  const ownerReportManagementFee = ownerReportTotalCollected * managementFeeRate
  const ownerReportPeriodLabel = \`\${formatDate(ownerReportPeriodStart)} through \${formatDate(ownerReportPeriodEnd)}\`

  async function closeOutManagementFeeInvoice() {`,
'owner reporting period calculations'
)

replaceOnce(
`      \`Monthly Rent: \${currency(totalMonthlyRent)}\`,
      \`Collected: \${currency(totalCollected)}\`,
      \`Outstanding: \${currency(totalOutstanding)}\`,
      \`10% Management Fee: \${currency(managementFeeCollected)}\`,
      '',
      'Owner Summary:',
      ...filteredLedgerRows.map((row) =>
        \`\${row.address} | \${row.effectiveTenant} | Rent: \${currency(row.effectiveRent)} | Collected: \${currency(row.totalPaid)} | Balance: \${currency(row.balanceRemaining)}\`
      ),
      '',
      'Notes:',
      'Balances reflect prior unpaid amounts carried forward. Prorated rents and tenant changes are applied where applicable. Management fee is calculated at 10% of collected rent.',`,
`      \`Collection Period: \${ownerReportPeriodLabel}\`,
      \`Monthly Rent: \${currency(totalMonthlyRent)}\`,
      \`Collected: \${currency(ownerReportTotalCollected)}\`,
      \`Outstanding: \${currency(totalOutstanding)}\`,
      \`10% Management Fee: \${currency(ownerReportManagementFee)}\`,
      '',
      'Owner Summary:',
      ...ownerReportRows.map((row) =>
        \`\${row.address} | \${row.effectiveTenant} | Rent: \${currency(row.effectiveRent)} | Collected: \${currency(row.ownerReportCollected)} | Payment Date(s): \${row.ownerReportPaymentDates.length ? row.ownerReportPaymentDates.map(formatDate).join(', ') : '—'} | Balance: \${currency(row.balanceRemaining)}\`
      ),
      '',
      'Notes:',
      'Collections follow the owner reporting cycle: payments received after the prior management-fee closeout through this report cutoff. Actual payment dates are shown. Balances continue to follow the tenant ledger.',`,
'owner report email totals'
)

replaceOnce(
`                <div style={styles.reportPrintMeta}>
                  <strong>Reporting Month:</strong> {formatMonthYear(selectedMonth)}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Generated:</strong> {generatedOnLabel}
                </div>`,
`                <div style={styles.reportPrintMeta}>
                  <strong>Reporting Month:</strong> {formatMonthYear(selectedMonth)}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Collection Period:</strong> {ownerReportPeriodLabel}
                </div>
                <div style={styles.reportPrintMeta}>
                  <strong>Generated:</strong> {generatedOnLabel}
                </div>`,
'owner report header period'
)

replaceOnce(
`                    <tr>
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
                        <tr key={\`report-\${row.id}\`}>
                          <td style={styles.td}>{row.address}</td>
                          <td style={styles.td}>{row.effectiveTenant}</td>
                          <td style={styles.td}>{currency(row.effectiveRent)}</td>
                          <td style={styles.td}>{currency(row.totalPaid)}</td>
                          <td style={styles.td}>{currency(row.balanceRemaining)}</td>
                        </tr>
                      ))
                    )}`,
`                    <tr>
                      <th style={styles.th}>Property</th>
                      <th style={styles.th}>Tenant</th>
                      <th style={styles.th}>Rent</th>
                      <th style={styles.th}>Collected</th>
                      <th style={styles.th}>Payment Date(s)</th>
                      <th style={styles.th}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerReportRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan="6">No matching properties for this report.</td>
                      </tr>
                    ) : (
                      ownerReportRows.map((row) => (
                        <tr key={\`report-\${row.id}\`}>
                          <td style={styles.td}>{row.address}</td>
                          <td style={styles.td}>{row.effectiveTenant}</td>
                          <td style={styles.td}>{currency(row.effectiveRent)}</td>
                          <td style={styles.td}>
                            <strong>{currency(row.ownerReportCollected)}</strong>
                            {row.ownerReportCarryIn > 0 ? (
                              <div style={styles.smallMuted}>Includes {currency(row.ownerReportCarryIn)} received after prior closeout</div>
                            ) : null}
                          </td>
                          <td style={styles.td}>
                            {row.ownerReportPaymentDates.length
                              ? row.ownerReportPaymentDates.map(formatDate).join(', ')
                              : '—'}
                          </td>
                          <td style={styles.td}>{currency(row.balanceRemaining)}</td>
                        </tr>
                      ))
                    )}`,
'owner report table'
)

replaceOnce(
`              <div style={styles.reportTotals}>
                <div><strong>Monthly Rent:</strong> {currency(totalMonthlyRent)}</div>
                <div><strong>Collected:</strong> {currency(totalCollected)}</div>
                <div><strong>Outstanding:</strong> {currency(totalOutstanding)}</div>
                <div><strong>10% Management Fee:</strong> {currency(managementFeeCollected)}</div>
              </div>

              <div style={styles.notesBox}>
                <strong>Notes:</strong> Balances reflect prior unpaid amounts carried forward. Prorated rents and tenant changes are applied where applicable. Management fee is calculated at 10% of collected rent.
              </div>`,
`              <div style={styles.reportTotals}>
                <div><strong>Monthly Rent:</strong> {currency(totalMonthlyRent)}</div>
                <div><strong>Collected:</strong> {currency(ownerReportTotalCollected)}</div>
                <div><strong>Outstanding:</strong> {currency(totalOutstanding)}</div>
                <div><strong>10% Management Fee:</strong> {currency(ownerReportManagementFee)}</div>
              </div>

              <div style={styles.notesBox}>
                <strong>Notes:</strong> Collections shown are based on the owner reporting cycle — payments received after the prior management-fee closeout through this report cutoff. Actual payment dates are shown, including payments received late in the prior calendar month that rolled into this report. Tenant balances continue to follow the ledger, so advance payments and credits remain applied correctly.
              </div>`,
'owner report totals and notes'
)

fs.writeFileSync(path, s)
console.log('Owner report closeout-period update applied.')
