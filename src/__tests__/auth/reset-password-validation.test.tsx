import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation before importing the component
const mockGet = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/auth/reset-password",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react icons used in the component
vi.mock("lucide-react", () => ({
  Gauge: () => <svg data-testid="icon-gauge" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  XCircle: () => <svg data-testid="icon-xcircle" />,
}));

// Mock UI components (pass-through)
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

// Mock authClient
const mockResetPassword = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
  },
}));

// Import the inner component — we test ResetPasswordInner via ResetPasswordPage's Suspense wrapper
// Since ResetPasswordInner is not exported, we render the default export which wraps it in Suspense.
import ResetPasswordPage from "@/app/(public)/auth/reset-password/page";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ResetPasswordPage — ResetPasswordInner", () => {
  it("shows invalid token message when no token in URL", () => {
    mockGet.mockReturnValue(null);
    render(<ResetPasswordPage />);
    expect(screen.getByText(/invalid or missing reset token/i)).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("shows the form when a token is present", () => {
    mockGet.mockReturnValue("valid-token-abc");
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("shows passwords do not match error without calling resetPassword", async () => {
    mockGet.mockReturnValue("valid-token-abc");
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "password1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password2");
    fireEvent.submit(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("shows password length error without calling resetPassword", async () => {
    mockGet.mockReturnValue("valid-token-abc");
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "short");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "short");
    fireEvent.submit(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("shows error message when authClient.resetPassword returns an error", async () => {
    mockGet.mockReturnValue("valid-token-abc");
    mockResetPassword.mockResolvedValue({ error: { message: "Token has expired" } });
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "securepass1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "securepass1");
    fireEvent.submit(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/token has expired/i)).toBeInTheDocument();
    });
  });

  it("shows success state with sign-in link when reset succeeds", async () => {
    mockGet.mockReturnValue("valid-token-abc");
    mockResetPassword.mockResolvedValue({ error: null });
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "securepass1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "securepass1");
    fireEvent.submit(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password has been reset successfully/i)).toBeInTheDocument();
    });
    // The success state renders a "Sign In" button (distinct from the footer "Back to Sign In" link)
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });
});
