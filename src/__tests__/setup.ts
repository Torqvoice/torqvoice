import "@testing-library/jest-dom";
import { vi } from "vitest";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Load all English translation files so the next-intl mock resolves keys to
// real English strings. This lets existing test assertions (e.g.
// getByText("Download PDF")) continue to work after the i18n migration.
// ---------------------------------------------------------------------------
const messagesDir = path.resolve(process.cwd(), "messages/en");
const allMessages: Record<string, unknown> = {};

for (const file of fs.readdirSync(messagesDir)) {
  if (file.endsWith(".json")) {
    const ns = file.replace(".json", "");
    allMessages[ns] = JSON.parse(
      fs.readFileSync(path.join(messagesDir, file), "utf-8"),
    );
  }
}

/** Resolve a dot-separated key path inside a nested object. */
function resolve(obj: unknown, keyPath: string): string | undefined {
  let cur = obj;
  for (const seg of keyPath.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Replace `{name}` placeholders with values from the given record. */
function interpolate(
  tpl: string,
  values?: Record<string, unknown>,
): string {
  if (!values) return tpl;
  return Object.entries(values).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    tpl,
  );
}

// Mock next-intl globally so components using useTranslations can render in tests.
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    // Namespace examples: "share.invoice", "auth.resetPassword", "common"
    const parts = namespace.split(".");
    const file = parts[0];
    const sub = parts.slice(1).join(".");

    let messages: unknown = allMessages[file];
    if (sub && messages && typeof messages === "object") {
      messages = (messages as Record<string, unknown>)[sub];
    }

    const t = (key: string, values?: Record<string, unknown>) => {
      const tpl = resolve(messages, key);
      if (tpl) return interpolate(tpl, values);
      // Fallback: return key (with values appended)
      if (values) return `${key} ${JSON.stringify(values)}`;
      return key;
    };
    t.raw = (key: string) => resolve(messages, key) ?? key;
    t.rich = (key: string, values?: Record<string, unknown>) => {
      const tpl = resolve(messages, key);
      return tpl ? interpolate(tpl, values) : key;
    };
    t.markup = (key: string) => resolve(messages, key) ?? key;
    t.has = (key: string) => resolve(messages, key) !== undefined;
    return t;
  },
  useLocale: () => "en",
  useMessages: () => ({}),
  NextIntlClientProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
}));
