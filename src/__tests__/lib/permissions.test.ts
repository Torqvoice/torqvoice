import { describe, it, expect } from "vitest";
import {
  hasPermission,
  hasAllPermissions,
  PermissionAction,
  PermissionSubject,
} from "@/lib/permissions";

describe("hasPermission", () => {
  const read_quotes = { action: PermissionAction.READ, subject: PermissionSubject.QUOTES };
  const create_quotes = { action: PermissionAction.CREATE, subject: PermissionSubject.QUOTES };
  const read_vehicles = { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES };

  it("returns true when permission matches action and subject", () => {
    expect(hasPermission([read_quotes], read_quotes)).toBe(true);
  });

  it("returns false when action does not match", () => {
    expect(hasPermission([read_quotes], create_quotes)).toBe(false);
  });

  it("returns false when subject does not match", () => {
    expect(hasPermission([read_quotes], read_vehicles)).toBe(false);
  });

  it("returns false for empty permissions array", () => {
    expect(hasPermission([], read_quotes)).toBe(false);
  });

  it("returns true when the matching permission is among multiple", () => {
    expect(hasPermission([create_quotes, read_vehicles, read_quotes], read_quotes)).toBe(true);
  });
});

describe("hasAllPermissions", () => {
  const read_quotes = { action: PermissionAction.READ, subject: PermissionSubject.QUOTES };
  const create_quotes = { action: PermissionAction.CREATE, subject: PermissionSubject.QUOTES };
  const read_vehicles = { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES };

  it("returns true when all required permissions are present", () => {
    expect(
      hasAllPermissions([read_quotes, create_quotes, read_vehicles], [read_quotes, create_quotes]),
    ).toBe(true);
  });

  it("returns false when one required permission is missing", () => {
    expect(hasAllPermissions([read_quotes], [read_quotes, create_quotes])).toBe(false);
  });

  it("returns true when required array is empty", () => {
    expect(hasAllPermissions([], [])).toBe(true);
    expect(hasAllPermissions([read_quotes], [])).toBe(true);
  });

  it("returns false when user has no permissions", () => {
    expect(hasAllPermissions([], [read_quotes])).toBe(false);
  });
});
