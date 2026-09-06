/**
 * Make next-ws wait for a route module before reading its exports.
 *
 * Next 16.3 loads route modules lazily: `routeModule.userland` throws
 * "The lazy module is still loading" until `ensureUserland()` has resolved.
 * next-ws 2.2.14 reads `userland` the moment an upgrade request arrives, so
 * the first WebSocket connection after every boot died as an unhandled
 * rejection and the browser had to reconnect. This runs after `next-ws patch`,
 * both locally and in the runtime image, and fails loudly when the code it
 * expects is not there, so a next-ws bump cannot skip it quietly.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(`${process.cwd()}/`)
const file = require.resolve('next-ws/server')
const source = readFileSync(file, 'utf8')

const anchor = '    const handleUpgrade = module2.userland.UPGRADE;\n'
const fix = '    if (typeof module2.ensureUserland === "function") await module2.ensureUserland();\n'

if (source.includes(fix)) {
  console.log(`[next-ws] first-upgrade fix already applied to ${file}`)
} else if (source.includes(anchor)) {
  writeFileSync(file, source.replace(anchor, fix + anchor))
  console.log(`[next-ws] first-upgrade fix applied to ${file}`)
} else {
  console.error(
    `[next-ws] could not apply the first-upgrade fix: ${file} no longer contains the expected upgrade handler. Check whether the installed next-ws already awaits ensureUserland() and update scripts/patch-next-ws-first-upgrade.mjs.`
  )
  process.exit(1)
}
