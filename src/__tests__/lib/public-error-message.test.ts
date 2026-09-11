import { describe, expect, it } from 'vitest'
import {
  isInternalError,
  publicErrorMessage,
  UNEXPECTED_ERROR_MESSAGE,
} from '@/lib/public-error-message'

describe('publicErrorMessage', () => {
  it("passes on an action's own error", () => {
    expect(publicErrorMessage(new Error('Vehicle not found'))).toBe('Vehicle not found')
  })

  it("passes on the app's own error classes", () => {
    class DocumentLockedError extends Error {
      constructor() {
        super('This invoice has been issued and can no longer be changed')
        this.name = 'DocumentLockedError'
      }
    }
    expect(publicErrorMessage(new DocumentLockedError())).toBe(
      'This invoice has been issued and can no longer be changed'
    )
  })

  it('hides what the database said', () => {
    for (const name of [
      'PrismaClientKnownRequestError',
      'PrismaClientUnknownRequestError',
      'PrismaClientValidationError',
      'PrismaClientInitializationError',
      'PrismaClientRustPanicError',
    ]) {
      const error = Object.assign(
        new Error(
          'Invalid `db.vehicle.findMany()` invocation in /workspace/.next/dev/server/chunks/ssr/x.js:2293:140 Value out of range for the type'
        ),
        { name }
      )
      expect(publicErrorMessage(error), name).toBe(UNEXPECTED_ERROR_MESSAGE)
    }
  })

  it('hides runtime and system errors', () => {
    expect(
      isInternalError(new TypeError("Cannot read properties of undefined (reading 'id')"))
    ).toBe(true)
    expect(isInternalError(new RangeError('Invalid time value'))).toBe(true)
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    })
    expect(publicErrorMessage(refused)).toBe(UNEXPECTED_ERROR_MESSAGE)
  })

  it('hides a thrown value that is not an error', () => {
    expect(publicErrorMessage('boom')).toBe(UNEXPECTED_ERROR_MESSAGE)
    expect(publicErrorMessage(undefined)).toBe(UNEXPECTED_ERROR_MESSAGE)
  })
})
