// Deliberately bounded scan: common credential patterns and prohibited runtime files.
// Review synthetic fixture provenance and screenshot content separately.
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /AKIA[0-9A-Z]{16}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/
]
const prohibited = /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:db(?:-wal|-shm|-journal)?|sqlite3?))$/i
const findings = []
function inspect(label, bytes) {
  if (prohibited.test(label)) findings.push(`${label}: prohibited runtime or environment file`)
  const text = bytes.toString('utf8')
  if (patterns.some((pattern) => pattern.test(text)))
    findings.push(`${label}: potential credential (value withheld)`)
}
const paths = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
  .split('\0')
  .filter(Boolean)
for (const path of new Set(paths)) inspect(path, readFileSync(path))
const objects = git('rev-list', '--objects', '--all').trim().split('\n').filter(Boolean)
let blobs = 0
for (const row of objects) {
  const split = row.indexOf(' '),
    id = split < 0 ? row : row.slice(0, split),
    name = split < 0 ? id : row.slice(split + 1)
  if (git('cat-file', '-t', id).trim() !== 'blob') continue
  blobs++
  inspect(name, execFileSync('git', ['cat-file', 'blob', id], { maxBuffer: 64 * 1024 * 1024 }))
}
if (findings.length) {
  console.error([...new Set(findings)].join('\n'))
  process.exit(1)
}
console.log(
  `Privacy scan PASS: ${new Set(paths).size} working files and ${blobs} historical blobs; no configured credential patterns or prohibited runtime files found.`
)
