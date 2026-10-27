import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let cached: string | undefined

/**
 * The id of the build this server runs, the same for every request until the
 * next deploy. A page carries the id it was rendered with; when the server
 * answers with another one, the tab is running old code and is offered a
 * reload. The dev server has no stable id, so it never asks.
 *
 * Read from `.next/BUILD_ID`, which the standalone output keeps next to
 * server.js. APP_VERSION is not used: it is the image tag, and a redeploy of
 * the same tag still ships new code.
 */
export function buildVersion(): string {
  if (cached !== undefined) return cached
  if (process.env.NODE_ENV !== 'production') {
    cached = 'development'
    return cached
  }
  try {
    cached = readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()
  } catch {
    cached = 'unknown'
  }
  return cached
}
