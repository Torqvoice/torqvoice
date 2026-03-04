import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

let appVersion: string | undefined;
try {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
  appVersion = pkg.version;
} catch {
  // ignore
}

export async function GET() {
  return NextResponse.json({ status: "ok", version: appVersion ?? "unknown" });
}
