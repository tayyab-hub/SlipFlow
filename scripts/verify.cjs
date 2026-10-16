const { spawnSync } = require('node:child_process')
const { rmSync } = require('node:fs')
const { resolve, sep } = require('node:path')
const { tmpdir } = require('node:os')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const electron = require('electron')
for (const suite of ['db', 'import', 'grouping', 'review', 'release']) {
  const result = spawnSync(electron, [`out/main/${suite}-verify.js`], {
    encoding: 'utf8',
    env,
    timeout: 180000
  })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  const temporary = (result.stdout || '').match(/VERIFY_TEMP (.+)/)?.[1]?.trim()
  if (
    temporary &&
    resolve(temporary).startsWith(resolve(tmpdir()) + sep) &&
    resolve(temporary).split(sep).pop().startsWith('slipflow-release-')
  )
    rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  if (result.status !== 0 || result.error) {
    console.error(result.error || `${suite} failed`)
    process.exit(1)
  }
}
console.log('All verification suites passed.')
