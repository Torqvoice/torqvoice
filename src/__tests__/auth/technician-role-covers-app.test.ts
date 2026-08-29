import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TECHNICIAN_PERMISSIONS } from '@/features/team/Lib/technicianRole'

/**
 * The technician role has to carry whatever the technician app asks for.
 *
 * withApiAuth enforces requiredPermissions exactly as withAuth does, so an
 * endpoint that asks for something the role does not hold answers "Your role
 * does not allow this" to a technician doing their job. That failed silently
 * once already: accounts were created with no role at all, on the belief that
 * the API was gated on the technician record alone, and every screen in the
 * app returned 403.
 *
 * Reading the routes rather than a list somebody maintains, because the list
 * is the thing that goes stale.
 */

const TECH_API = path.join(process.cwd(), 'src/app/api/v1/tech')

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

/** Every `{ action: PermissionAction.X, subject: PermissionSubject.Y }` in a file. */
function demandedBy(source: string): { action: string; subject: string }[] {
  const pattern =
    /\{\s*action:\s*PermissionAction\.([A-Z_]+),\s*subject:\s*PermissionSubject\.([A-Z_]+)\s*\}/g
  return [...source.matchAll(pattern)].map((m) => ({
    action: m[1].toLowerCase(),
    subject: m[2].toLowerCase(),
  }))
}

describe('the technician role covers the technician app', () => {
  const held = new Set(TECHNICIAN_PERMISSIONS.map((p) => `${p.action}:${p.subject}`))

  it('holds every permission the routes ask for', () => {
    const missing = new Map<string, string[]>()

    for (const file of routeFiles(TECH_API)) {
      const source = fs.readFileSync(file, 'utf-8')
      // Only what is actually enforced, not permissions mentioned in passing.
      if (!source.includes('requiredPermissions')) continue

      for (const { action, subject } of demandedBy(source)) {
        const key = `${action}:${subject}`
        if (held.has(key)) continue
        const route = path.relative(TECH_API, file).replace(/\/route\.ts$/, '')
        missing.set(key, [...(missing.get(key) ?? []), route])
      }
    }

    expect(
      Object.fromEntries(missing),
      'Add these to TECHNICIAN_PERMISSIONS, or the app answers "Your role does not allow this"'
    ).toEqual({})
  })

  it('holds nothing the routes do not ask for', () => {
    // A role handed to every mechanic in every workshop should carry exactly
    // what the app needs and not a permission more.
    const demanded = new Set<string>()
    for (const file of routeFiles(TECH_API)) {
      const source = fs.readFileSync(file, 'utf-8')
      if (!source.includes('requiredPermissions')) continue
      for (const { action, subject } of demandedBy(source)) demanded.add(`${action}:${subject}`)
    }

    const spare = [...held].filter((p) => !demanded.has(p))
    expect(spare, 'Granted to every technician and used by nothing').toEqual([])
  })

  it('reads more than one route, so a broken walk fails loudly', () => {
    const withPermissions = routeFiles(TECH_API).filter((f) =>
      fs.readFileSync(f, 'utf-8').includes('requiredPermissions')
    )
    expect(withPermissions.length).toBeGreaterThan(5)
  })
})
