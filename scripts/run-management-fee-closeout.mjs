import fs from 'node:fs'

const appPath = 'src/App.jsx'
const source = fs.readFileSync(appPath, 'utf8')
fs.writeFileSync(appPath, source.replace(/\r\n/g, '\n'))

await import('./apply-management-fee-closeout.mjs')
