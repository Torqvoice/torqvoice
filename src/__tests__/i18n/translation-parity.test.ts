import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const messagesRoot = path.resolve(process.cwd(), "messages");
const REFERENCE_LOCALE = "en";

const allLocales = fs
  .readdirSync(messagesRoot)
  .filter((entry) => fs.statSync(path.join(messagesRoot, entry)).isDirectory())
  .sort();

const otherLocales = allLocales.filter((l) => l !== REFERENCE_LOCALE);

function loadNamespace(locale: string, namespace: string): unknown {
  const file = path.join(messagesRoot, locale, `${namespace}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function collectLeafPaths(obj: unknown, prefix = ""): string[] {
  if (obj == null || typeof obj !== "object") return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out.push(...collectLeafPaths(value, next));
    } else {
      out.push(next);
    }
  }
  return out;
}

function resolve(obj: unknown, keyPath: string): unknown {
  let cur = obj;
  for (const seg of keyPath.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const referenceNamespaces = fs
  .readdirSync(path.join(messagesRoot, REFERENCE_LOCALE))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

describe("translation parity", () => {
  it("discovers all expected locales", () => {
    expect(allLocales).toContain(REFERENCE_LOCALE);
    expect(allLocales.length).toBeGreaterThanOrEqual(12);
  });

  describe.each(referenceNamespaces)("namespace %s", (namespace) => {
    const referenceMessages = loadNamespace(REFERENCE_LOCALE, namespace);
    const referencePaths = collectLeafPaths(referenceMessages);

    it.each(otherLocales)(
      `every en key resolves in %s/${"%%"}`.replace("%%", namespace),
      (locale) => {
        const messages = loadNamespace(locale, namespace);
        expect(messages, `messages/${locale}/${namespace}.json missing`).toBeDefined();

        const missing: string[] = [];
        for (const keyPath of referencePaths) {
          const value = resolve(messages, keyPath);
          if (typeof value !== "string") {
            missing.push(keyPath);
          }
        }
        expect(
          missing,
          `${locale}/${namespace}.json is missing ${missing.length} key(s):\n  - ${missing.join("\n  - ")}`,
        ).toEqual([]);
      },
    );
  });
});

describe("recently added i18n keys", () => {
  const requiredKeys: Array<{ namespace: string; key: string }> = [
    { namespace: "dashboard", key: "maintenance.settingsAriaLabel" },
    { namespace: "dashboard", key: "maintenance.dismissAriaLabel" },
    { namespace: "dashboard", key: "quoteRequests.dismissAriaLabel" },
    { namespace: "dashboard", key: "quoteResponses.dismissAriaLabel" },
    { namespace: "statusReport", key: "create.createReportFailed" },
    { namespace: "quotes", key: "images.failedUploadFile" },
    { namespace: "quotes", key: "images.failedSaveFile" },
    { namespace: "quotes", key: "documents.failedUploadFile" },
    { namespace: "quotes", key: "documents.failedSaveFile" },
    { namespace: "settings", key: "subscription.checkoutError" },
    { namespace: "settings", key: "reportSchedule.failedSave" },
    { namespace: "settings", key: "reportSchedule.failedSend" },
    { namespace: "settings", key: "reportSchedule.failedToggle" },
    { namespace: "settings", key: "reportSchedule.failedDelete" },
  ];

  it.each(requiredKeys)(
    "$namespace.$key is present in all locales",
    ({ namespace, key }) => {
      for (const locale of allLocales) {
        const messages = loadNamespace(locale, namespace);
        const value = resolve(messages, key);
        expect(
          typeof value,
          `${locale}/${namespace}.json missing ${key} (got ${JSON.stringify(value)})`,
        ).toBe("string");
      }
    },
  );
});
