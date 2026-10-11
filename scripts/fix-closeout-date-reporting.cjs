const fs = require('fs')
const path = 'src/App.jsx'
let s = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function replaceOnce(oldText, newText, label) {
  const count = s.split(oldText).length - 1
  if (count !== 1) throw new Error(label + ': expected 1 match, found ' + count)
  s = s.replace(oldText, newText)
}

replaceOnce(
`  const ownerReportSelectedCloseout = useMemo(() => {
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
  }, [companyManagementFeeInvoices, selectedMonth])`,
`  const ownerReportSelectedCloseout = useMemo(() => {
    return companyManagementFeeInvoices
      .filter((invoice) => (
        String(invoice.status || 'closed').toLowerCase() === 'closed' &&
        invoice.cutoff_date &&
        monthKeyFromDate(invoice.cutoff_date) === selectedMonth
      ))
      .slice()
      .sort((a, b) => String(b.cutoff_date).localeCompare(String(a.cutoff_date)))[0] || null
  }, [companyManagementFeeInvoices, selectedMonth])

  const ownerReportPriorCloseout = useMemo(() => {
    const selectedMonthStart = startOfMonth(selectedMonth)

    return companyManagementFeeInvoices
      .filter((invoice) => {
        if (String(invoice.status || 'closed').toLowerCase() !== 'closed' || !invoice.cutoff_date) {
          return false
        }

        const cutoffDate = normalizeDateInputValue(invoice.cutoff_date)
        return cutoffDate && cutoffDate < selectedMonthStart
      })
      .slice()
      .sort((a, b) => String(b.cutoff_date).localeCompare(String(a.cutoff_date)))[0] || null
  }, [companyManagementFeeInvoices, selectedMonth])`,
'owner report closeout selection'
)

replaceOnce(
`    const invoiceNumber = \`\${getManagementInvoiceNumber()}-\${cutoffDate.replaceAll('-', '')}\`
    const { data: invoice, error: invoiceError } = await supabase
      .from('management_fee_invoices')
      .insert({
        company_id: selectedCompanyId,
        invoice_month: selectedMonth,
        invoice_number: invoiceNumber,`,
`    const invoiceMonth = monthKeyFromDate(cutoffDate) || selectedMonth
    const invoiceNumber = \`\${getManagementInvoiceNumber(invoiceMonth)}-\${cutoffDate.replaceAll('-', '')}\`
    const { data: invoice, error: invoiceError } = await supabase
      .from('management_fee_invoices')
      .insert({
        company_id: selectedCompanyId,
        invoice_month: invoiceMonth,
        invoice_number: invoiceNumber,`,
'management fee closeout month'
)

replaceOnce(
`  function getManagementInvoiceNumber() {
    const compactMonth = selectedMonth.replace('-', '')`,
`  function getManagementInvoiceNumber(monthOverride = selectedMonth) {
    const compactMonth = String(monthOverride || selectedMonth).replace('-', '')`,
'invoice number month override'
)

replaceOnce(
`                            <td style={styles.td}>{formatMonthYear(invoice.invoice_month)}</td>`,
`                            <td style={styles.td}>{formatMonthYear(monthKeyFromDate(invoice.cutoff_date) || invoice.invoice_month)}</td>`,
'closeout history displayed month'
)

fs.writeFileSync(path, s)
console.log('Closeout-date reporting logic corrected.')
