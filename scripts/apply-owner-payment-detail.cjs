const fs = require('fs')
const path = 'src/App.jsx'
let s = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function replaceOnce(oldText, newText, label) {
  const count = s.split(oldText).length - 1
  if (count !== 1) throw new Error(label + ': expected 1 match, found ' + count)
  s = s.replace(oldText, newText)
}

replaceOnce(
`      const current = map.get(payment.property_id) || {
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

      map.set(payment.property_id, current)`,
`      const current = map.get(payment.property_id) || {
        total: 0,
        carryIn: 0,
        paymentDates: [],
        payments: [],
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

      current.payments.push({
        id: payment.id,
        amount,
        date: paymentDate,
      })

      map.set(payment.property_id, current)`,
'owner payment map entries'
)

replaceOnce(
`      const paymentSummary = ownerReportPaymentMap.get(row.id) || {
        total: 0,
        carryIn: 0,
        paymentDates: [],
      }

      return {
        ...row,
        ownerReportCollected: paymentSummary.total,
        ownerReportCarryIn: paymentSummary.carryIn,
        ownerReportPaymentDates: paymentSummary.paymentDates,
      }`,
`      const paymentSummary = ownerReportPaymentMap.get(row.id) || {
        total: 0,
        carryIn: 0,
        paymentDates: [],
        payments: [],
      }

      return {
        ...row,
        ownerReportCollected: paymentSummary.total,
        ownerReportCarryIn: paymentSummary.carryIn,
        ownerReportPaymentDates: paymentSummary.paymentDates,
        ownerReportPayments: paymentSummary.payments,
      }`,
'owner report row payment details'
)

replaceOnce(
`      ...ownerReportRows.map((row) =>
        \`\${row.address} | \${row.effectiveTenant} | Rent: \${currency(row.effectiveRent)} | Collected: \${currency(row.ownerReportCollected)} | Payment Date(s): \${row.ownerReportPaymentDates.length ? row.ownerReportPaymentDates.map(formatDate).join(', ') : '—'} | Balance: \${currency(row.balanceRemaining)}\`
      ),`,
`      ...ownerReportRows.map((row) => {
        const paymentDetail = row.ownerReportPayments.length
          ? row.ownerReportPayments.map((payment) => \`\${currency(payment.amount)} on \${formatDate(payment.date)}\`).join('; ')
          : '—'
        return \`\${row.address} | \${row.effectiveTenant} | Rent: \${currency(row.effectiveRent)} | Payments: \${paymentDetail} | Balance: \${currency(row.balanceRemaining)}\`
      }),`,
'owner report email payment detail'
)

replaceOnce(
`                          <td style={styles.td}>
                            <strong>{currency(row.ownerReportCollected)}</strong>
                          </td>
                          <td style={styles.td}>
                            {row.ownerReportPaymentDates.length
                              ? row.ownerReportPaymentDates.map(formatDate).join(', ')
                              : '—'}
                          </td>`,
`                          <td style={styles.td}>
                            {row.ownerReportPayments.length ? (
                              <div style={{ display: 'grid', gap: '4px' }}>
                                {row.ownerReportPayments.map((payment) => (
                                  <div key={\`owner-payment-amount-\${payment.id}\`}>
                                    <strong>{currency(payment.amount)}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <strong>{currency(0)}</strong>
                            )}
                          </td>
                          <td style={styles.td}>
                            {row.ownerReportPayments.length ? (
                              <div style={{ display: 'grid', gap: '4px' }}>
                                {row.ownerReportPayments.map((payment) => (
                                  <div key={\`owner-payment-date-\${payment.id}\`}>
                                    {formatDate(payment.date)}
                                  </div>
                                ))}
                              </div>
                            ) : '—'}
                          </td>`,
'owner report payment amount/date rows'
)

fs.writeFileSync(path, s)
console.log('Owner report now lists each payment amount alongside its matching date.')
