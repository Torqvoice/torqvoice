import { PermissionAction, PermissionSubject, type PermissionInput } from '@/lib/permissions'
import type { ImportEntity } from './fields'

export const IMPORT_ENTITIES: readonly ImportEntity[] = ['customers', 'vehicles', 'services']

/** What a caller must hold to import each kind of file. */
export function permissionsFor(entity: ImportEntity): PermissionInput[] {
  switch (entity) {
    case 'customers':
      return [{ action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS }]
    case 'vehicles':
      return [
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ]
    case 'services':
      return [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ]
  }
}
