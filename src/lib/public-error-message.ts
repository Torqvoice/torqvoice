/**
 * What a failed action may tell the person who ran it.
 *
 * An action's own errors are written for the person using the app: "Vehicle
 * not found", a locked invoice, a clock already running. A database or runtime
 * error is not. It names tables, columns, query code and server file paths,
 * and a search box once put all of that on the vehicle list. Those are logged
 * on the server, and the page gets a plain sentence instead.
 */

export const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Please try again.'

const RUNTIME_ERRORS = new Set([
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'EvalError',
  'URIError',
])

/** Whether an error came from underneath the app rather than from its own rules. */
export function isInternalError(error: unknown): boolean {
  if (!(error instanceof Error)) return true
  // Prisma's error classes, matched by name so a bundled or mocked client
  // still counts.
  if (error.name.startsWith('PrismaClient')) return true
  if (RUNTIME_ERRORS.has(error.name)) return true
  // Node's system errors: a refused connection, a missing file.
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && /^E[A-Z0-9_]+$/.test(code)) return true
  return false
}

export function publicErrorMessage(error: unknown): string {
  return isInternalError(error) ? UNEXPECTED_ERROR_MESSAGE : (error as Error).message
}
