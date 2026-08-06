import { describe, it, expect } from "vitest";
import path from "path";
import { resolveWithinDir } from "@/lib/safe-path";

const base = path.join(path.sep, "tmp", "import-123");

describe("resolveWithinDir", () => {
  it("allows legitimate nested archive entries", () => {
    expect(resolveWithinDir(base, "lubelog_db_backup_x/data/cartracker.db")).toBe(
      path.join(base, "lubelog_db_backup_x/data/cartracker.db"),
    );
    expect(resolveWithinDir(base, "documents/client/file.pdf")).toBe(
      path.join(base, "documents/client/file.pdf"),
    );
    expect(resolveWithinDir(base, "documents/sub/ok.png")).toBe(
      path.join(base, "documents/sub/ok.png"),
    );
  });

  it("allows the base directory itself", () => {
    expect(resolveWithinDir(base, "")).toBe(base);
    expect(resolveWithinDir(base, ".")).toBe(base);
  });

  it("rejects plain parent-directory traversal (zip-slip)", () => {
    expect(resolveWithinDir(base, "../../../../home/sinamics/evil.js")).toBeNull();
    expect(resolveWithinDir(base, "..")).toBeNull();
  });

  it("rejects traversal that hides behind an allowed prefix", () => {
    // The Invoice-Ninja `startsWith("documents/")` bypass.
    expect(resolveWithinDir(base, "documents/../../../../etc/cron.d/evil")).toBeNull();
  });

  it("rejects absolute-path entries instead of remapping them inside base", () => {
    expect(resolveWithinDir(base, "/etc/passwd")).toBeNull();
  });

  it("does not treat a sibling directory with a shared prefix as inside", () => {
    // /tmp/import-123 must not accept /tmp/import-123-evil
    expect(resolveWithinDir(base, "../import-123-evil/x")).toBeNull();
  });
});
