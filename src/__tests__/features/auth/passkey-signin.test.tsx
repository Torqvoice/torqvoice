import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockGet = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/auth/sign-in",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Fingerprint: () => <svg data-testid="icon-fingerprint" />,
  Gauge: () => <svg data-testid="icon-gauge" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  XCircle: () => <svg data-testid="icon-xcircle" />,
}));

// Mock UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    disabled?: boolean;
    type?: string;
  }) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

// Mock authClient
const mockSignInEmail = vi.fn();
const mockSignInPasskey = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  signIn: {
    email: (...args: unknown[]) => mockSignInEmail(...args),
  },
  authClient: {
    signIn: {
      passkey: (...args: unknown[]) => mockSignInPasskey(...args),
    },
  },
}));

import { SignInForm } from "@/app/(public)/auth/sign-in/sign-in-form";

beforeEach(() => {
  vi.resetAllMocks();
  mockGet.mockReturnValue(null);
});

describe("SignInForm — Passkey", () => {
  it("renders the passkey sign-in button", () => {
    render(<SignInForm registrationDisabled={false} />);
    expect(screen.getByText(/sign in with passkey/i)).toBeInTheDocument();
  });

  it("renders the 'or' separator", () => {
    render(<SignInForm registrationDisabled={false} />);
    expect(screen.getByText("or")).toBeInTheDocument();
  });

  it("sets webauthn autocomplete on email field", () => {
    render(<SignInForm registrationDisabled={false} />);
    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("autocomplete", "username webauthn");
  });

  it("calls authClient.signIn.passkey and redirects on success", async () => {
    mockSignInPasskey.mockResolvedValue({ error: null });
    render(<SignInForm registrationDisabled={false} />);

    await userEvent.click(screen.getByText(/sign in with passkey/i));

    await waitFor(() => {
      expect(mockSignInPasskey).toHaveBeenCalled();
    });
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("redirects to custom redirect param on success", async () => {
    mockGet.mockReturnValue("/dashboard");
    mockSignInPasskey.mockResolvedValue({ error: null });
    render(<SignInForm registrationDisabled={false} />);

    await userEvent.click(screen.getByText(/sign in with passkey/i));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error when passkey sign-in returns an error", async () => {
    mockSignInPasskey.mockResolvedValue({
      error: { message: "Credential not found" },
    });
    render(<SignInForm registrationDisabled={false} />);

    await userEvent.click(screen.getByText(/sign in with passkey/i));

    await waitFor(() => {
      expect(screen.getByText("Credential not found")).toBeInTheDocument();
    });
  });

  it("shows fallback error when passkey sign-in throws", async () => {
    mockSignInPasskey.mockRejectedValue(new Error("Network error"));
    render(<SignInForm registrationDisabled={false} />);

    await userEvent.click(screen.getByText(/sign in with passkey/i));

    await waitFor(() => {
      expect(screen.getByText(/passkey sign-in failed/i)).toBeInTheDocument();
    });
  });

  it("email/password sign-in still works", async () => {
    mockSignInEmail.mockResolvedValue({ error: null });
    render(<SignInForm registrationDisabled={false} />);

    await userEvent.type(screen.getByLabelText("Email"), "user@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByText("Sign In"));

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "password123",
      });
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
