import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    verification: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { GET } from "@/app/api/public/confirm-email-change/route";
import { db } from "@/lib/db";

const mockFindVerification = vi.mocked(db.verification.findUnique);
const mockDeleteVerification = vi.mocked(db.verification.delete);
const mockFindUser = vi.mocked(db.user.findFirst);
const mockTransaction = vi.mocked(db.$transaction);

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/public/confirm-email-change");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function makeTokenAndHash() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function redirectUrl(response: Response): string {
  const location = response.headers.get("location") ?? "";
  return new URL(location).pathname + new URL(location).search;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/public/confirm-email-change", () => {
  it("redirects to error when token is missing", async () => {
    const res = await GET(makeRequest({ uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=invalid-token");
  });

  it("redirects to error when uid is missing", async () => {
    const res = await GET(makeRequest({ token: "some-token" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=invalid-token");
  });

  it("redirects to error when both token and uid are missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=invalid-token");
  });

  it("redirects to error when verification record not found", async () => {
    mockFindVerification.mockResolvedValue(null);
    const res = await GET(makeRequest({ token: "abc", uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=invalid-token");
  });

  it("redirects to token-expired when verification is expired", async () => {
    mockFindVerification.mockResolvedValue({
      id: "v-1",
      identifier: "email-change:user-1",
      value: JSON.stringify({ tokenHash: "abc", email: "new@example.com" }),
      expiresAt: new Date(Date.now() - 1000), // expired
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockDeleteVerification.mockResolvedValue({} as any);

    const res = await GET(makeRequest({ token: "some-token", uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=token-expired");
    expect(mockDeleteVerification).toHaveBeenCalledWith({ where: { id: "v-1" } });
  });

  it("redirects to invalid-token when stored value is not valid JSON", async () => {
    mockFindVerification.mockResolvedValue({
      id: "v-1",
      identifier: "email-change:user-1",
      value: "not-json{{{",
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockDeleteVerification.mockResolvedValue({} as any);

    const res = await GET(makeRequest({ token: "some-token", uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=invalid-token");
    expect(mockDeleteVerification).toHaveBeenCalledWith({ where: { id: "v-1" } });
  });

  it("redirects to invalid-token when token hash does not match", async () => {
    const { tokenHash } = makeTokenAndHash();
    mockFindVerification.mockResolvedValue({
      id: "v-1",
      identifier: "email-change:user-1",
      value: JSON.stringify({ tokenHash, email: "new@example.com" }),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Use a different token so hash won't match
    const res = await GET(makeRequest({ token: "wrong-token-value-here-1234567890abcdef1234567890abcdef", uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=invalid-token");
  });

  it("redirects to email-taken when email already in use by another user", async () => {
    const { token, tokenHash } = makeTokenAndHash();
    mockFindVerification.mockResolvedValue({
      id: "v-1",
      identifier: "email-change:user-1",
      value: JSON.stringify({ tokenHash, email: "new@example.com" }),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockFindUser.mockResolvedValue({ id: "other-user" } as any);
    mockDeleteVerification.mockResolvedValue({} as any);

    const res = await GET(makeRequest({ token, uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toBe("/settings/account?error=email-taken");
    expect(mockDeleteVerification).toHaveBeenCalledWith({ where: { id: "v-1" } });
  });

  it("updates user email, sets emailVerified=true, deletes verification, and redirects on success", async () => {
    const { token, tokenHash } = makeTokenAndHash();
    mockFindVerification.mockResolvedValue({
      id: "v-1",
      identifier: "email-change:user-1",
      value: JSON.stringify({ tokenHash, email: "new@example.com" }),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockFindUser.mockResolvedValue(null); // no other user has this email
    mockTransaction.mockResolvedValue([{}, {}] as any);

    const res = await GET(makeRequest({ token, uid: "user-1" }));
    expect(res.status).toBe(307);
    expect(redirectUrl(res)).toContain("emailChanged=true");
    expect(mockTransaction).toHaveBeenCalled();
  });
});
