const fs = require('fs')
const path = 'src/App.jsx'
let s = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const oldText = `                          <td style={styles.td}>
                            <strong>{currency(row.ownerReportCollected)}</strong>
                            {row.ownerReportCarryIn > 0 ? (
                              <div style={styles.smallMuted}>Includes {currency(row.ownerReportCarryIn)} received after prior closeout</div>
                            ) : null}
                          </td>`

const newText = `                          <td style={styles.td}>
                            <strong>{currency(row.ownerReportCollected)}</strong>
                          </td>`

const count = s.split(oldText).length - 1
if (count !== 1) throw new Error('Expected 1 owner-report collected block, found ' + count)

s = s.replace(oldText, newText)
fs.writeFileSync(path, s)
console.log('Removed carry-in note from owner report collected cells.')
