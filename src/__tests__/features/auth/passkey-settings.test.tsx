import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Fingerprint: () => <svg data-testid="icon-fingerprint" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  LogIn: () => <svg data-testid="icon-log-in" />,
  Pencil: () => <svg data-testid="icon-pencil" />,
  Plus: () => <svg data-testid="icon-plus" />,
  Trash2: () => <svg data-testid="icon-trash" />,
  X: () => <svg data-testid="icon-x" />,
}))

// Mock UI components (pass-through)
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props}>{children}</h3>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode; className?: string }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode; className?: string }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode; className?: string }) => (
    <h2>{children}</h2>
  ),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    disabled?: boolean
  }) => <button {...props}>{children}</button>,
}))
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}))
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}))

// Mock sonner
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastCustom = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    custom: (...args: unknown[]) => mockToastCustom(...args),
    dismiss: vi.fn(),
  },
}))

/** Puts the notice the toaster was handed on screen, the way sonner would. */
function showToastedNotice() {
  const [draw, options] = mockToastCustom.mock.calls[0] as [
    (toastId: string) => React.ReactElement,
    { id: string },
  ]
  render(draw(options.id))
}

// Mock authClient.passkey
const mockListUserPasskeys = vi.fn()
const mockAddPasskey = vi.fn()
const mockDeletePasskey = vi.fn()
const mockUpdatePasskey = vi.fn()
const mockSignOut = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: (...args: unknown[]) => mockSignOut(...args),
    passkey: {
      listUserPasskeys: (...args: unknown[]) => mockListUserPasskeys(...args),
      addPasskey: (...args: unknown[]) => mockAddPasskey(...args),
      deletePasskey: (...args: unknown[]) => mockDeletePasskey(...args),
      updatePasskey: (...args: unknown[]) => mockUpdatePasskey(...args),
    },
  },
}))

import { PasskeySettings } from '@/features/settings/Components/passkey-settings'

const MOCK_PASSKEY = {
  id: 'pk_1',
  name: 'MacBook Pro',
  credentialID: 'cred-abc',
  deviceType: 'multiDevice',
  createdAt: new Date('2026-01-15'),
}

const MOCK_PASSKEY_SINGLE = {
  id: 'pk_2',
  name: null,
  credentialID: 'cred-def',
  deviceType: 'singleDevice',
  createdAt: new Date('2026-02-10'),
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PasskeySettings', () => {
  describe('initial load', () => {
    it('shows empty state when no passkeys exist', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      render(<PasskeySettings />)

      await waitFor(() => {
        expect(screen.getByText(/no passkeys registered/i)).toBeInTheDocument()
      })
    })

    it('renders passkey list with name and device type', async () => {
      mockListUserPasskeys.mockResolvedValue({
        data: [MOCK_PASSKEY, MOCK_PASSKEY_SINGLE],
      })
      render(<PasskeySettings />)

      await waitFor(() => {
        expect(screen.getByText('MacBook Pro')).toBeInTheDocument()
      })
      expect(screen.getByText(/synced across devices/i)).toBeInTheDocument()
      expect(screen.getByText(/unnamed passkey/i)).toBeInTheDocument()
      expect(screen.getByText(/this device only/i)).toBeInTheDocument()
    })

    it('shows title and description', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      render(<PasskeySettings />)

      await waitFor(() => {
        expect(screen.getByText('Passkeys')).toBeInTheDocument()
      })
      expect(screen.getByText(/sign in with biometrics or a security key/i)).toBeInTheDocument()
    })
  })

  describe('register passkey', () => {
    it('calls addPasskey and shows success toast', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      mockAddPasskey.mockResolvedValue({})
      // After registering, the list is fetched again
      mockListUserPasskeys.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({
        data: [MOCK_PASSKEY],
      })

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText(/register passkey/i)).toBeInTheDocument()
      })

      await userEvent.click(screen.getByText(/register passkey/i))

      await waitFor(() => {
        expect(mockAddPasskey).toHaveBeenCalled()
      })
      expect(mockToastSuccess).toHaveBeenCalledWith('Passkey registered successfully')
    })

    it('names the new passkey after the device it is made on', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      mockAddPasskey.mockResolvedValue({})
      const ua = vi
        .spyOn(navigator, 'userAgent', 'get')
        .mockReturnValue(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
        )
      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText(/register passkey/i)).toBeInTheDocument()
      })
      await userEvent.click(screen.getByText(/register passkey/i))
      await waitFor(() => {
        expect(mockAddPasskey).toHaveBeenCalledWith({ name: 'Chrome on Mac' })
      })
      ua.mockRestore()
    })

    it('shows error toast when registration fails', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      mockAddPasskey.mockRejectedValue(new Error('WebAuthn not supported'))

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText(/register passkey/i)).toBeInTheDocument()
      })

      await userEvent.click(screen.getByText(/register passkey/i))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to register passkey')
      })
    })

    it('shows error toast when addPasskey returns error', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      mockAddPasskey.mockResolvedValue({
        error: { message: 'Browser not supported' },
      })

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText(/register passkey/i)).toBeInTheDocument()
      })

      await userEvent.click(screen.getByText(/register passkey/i))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Browser not supported')
      })
    })

    it('asks for a new sign-in, and offers it, when the sign-in is too old to add a passkey', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', {
        ...window.location,
        pathname: '/settings/account',
        search: '',
        assign,
      })
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      // What Better Auth answers once the session is older than its fresh age
      mockAddPasskey.mockResolvedValue({
        data: null,
        error: {
          code: 'SESSION_NOT_FRESH',
          message: 'Session is not fresh',
          status: 403,
          statusText: 'Forbidden',
        },
      })

      render(<PasskeySettings />)
      await userEvent.click(await screen.findByRole('button', { name: /register passkey/i }))

      await waitFor(() => {
        expect(mockToastCustom).toHaveBeenCalledTimes(1)
      })
      showToastedNotice()
      expect(screen.getByRole('status')).toHaveTextContent('Sign in again to add a passkey')
      expect(screen.queryByText(/session is not fresh/i)).not.toBeInTheDocument()
      expect(mockToastError).not.toHaveBeenCalled()
      // Nothing happens to the session until the person asks for it
      expect(mockSignOut).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /register passkey/i })).toBeEnabled()

      await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }))

      await waitFor(() => {
        expect(assign).toHaveBeenCalledWith('/auth/sign-in?redirect=%2Fsettings%2Faccount')
      })
      // The sign-in page sends a signed-in visitor straight back, so the old
      // session has to be over before the tab gets there
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
        assign.mock.invocationCallOrder[0]
      )
    })

    // What the passkey client really hands back, see @better-auth/passkey's client
    it.each([
      {
        how: 'dismissed or left to time out',
        code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
        message:
          'The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.',
      },
      {
        how: 'replaced by another prompt',
        code: 'ERROR_CEREMONY_ABORTED',
        message: 'Registration cancelled',
      },
    ])('says nothing and can be tried again when the browser prompt was $how', async ({
      code,
      message,
    }) => {
      mockListUserPasskeys.mockResolvedValue({ data: [] })
      mockAddPasskey.mockResolvedValue({
        data: null,
        error: { code, message, status: 400, statusText: 'BAD_REQUEST' },
      })

      render(<PasskeySettings />)
      await userEvent.click(await screen.findByRole('button', { name: /register passkey/i }))
      await waitFor(() => {
        expect(mockAddPasskey).toHaveBeenCalledTimes(1)
      })

      // Back to a button that can be pressed, not a spinner that never stops
      const button = await screen.findByRole('button', { name: /register passkey/i })
      expect(button).toBeEnabled()
      expect(mockToastError).not.toHaveBeenCalled()
      expect(mockToastCustom).not.toHaveBeenCalled()

      await userEvent.click(button)
      await waitFor(() => {
        expect(mockAddPasskey).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('delete passkey', () => {
    it('opens confirmation dialog and deletes on confirm', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [MOCK_PASSKEY] })
      mockDeletePasskey.mockResolvedValue({})

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText('MacBook Pro')).toBeInTheDocument()
      })

      // Click the delete (trash) icon button
      const trashIcon = screen.getByTestId('icon-trash')
      await userEvent.click(trashIcon.closest('button')!)

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete this passkey/i)
        ).toBeInTheDocument()
      })

      // Click the "Delete" button in dialog
      const deleteButtons = screen.getAllByText('Delete')
      const confirmButton = deleteButtons.find(
        (btn) => btn.closest("[data-testid='dialog']") !== null
      )
      await userEvent.click(confirmButton!)

      await waitFor(() => {
        expect(mockDeletePasskey).toHaveBeenCalledWith({ id: 'pk_1' })
      })
      expect(mockToastSuccess).toHaveBeenCalledWith('Passkey deleted')
    })

    it('shows error toast when delete fails', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [MOCK_PASSKEY] })
      mockDeletePasskey.mockRejectedValue(new Error('Server error'))

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText('MacBook Pro')).toBeInTheDocument()
      })

      const trashIcon = screen.getByTestId('icon-trash')
      await userEvent.click(trashIcon.closest('button')!)

      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete this passkey/i)
        ).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByText('Delete')
      const confirmButton = deleteButtons.find(
        (btn) => btn.closest("[data-testid='dialog']") !== null
      )
      await userEvent.click(confirmButton!)

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to delete passkey')
      })
    })
  })

  describe('rename passkey', () => {
    it('opens rename dialog and updates name', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [MOCK_PASSKEY] })
      mockUpdatePasskey.mockResolvedValue({})

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText('MacBook Pro')).toBeInTheDocument()
      })

      // Click the pencil icon
      const pencilIcon = screen.getByTestId('icon-pencil')
      await userEvent.click(pencilIcon.closest('button')!)

      // Rename dialog should open with pre-filled name
      await waitFor(() => {
        expect(screen.getByText(/rename passkey/i)).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      expect(nameInput).toHaveValue('MacBook Pro')

      // Clear and type a new name
      await userEvent.clear(nameInput)
      await userEvent.type(nameInput, 'Work Laptop')

      // Click Save
      await userEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockUpdatePasskey).toHaveBeenCalledWith({
          id: 'pk_1',
          name: 'Work Laptop',
        })
      })
    })

    it('shows error toast when rename fails', async () => {
      mockListUserPasskeys.mockResolvedValue({ data: [MOCK_PASSKEY] })
      mockUpdatePasskey.mockRejectedValue(new Error('Server error'))

      render(<PasskeySettings />)
      await waitFor(() => {
        expect(screen.getByText('MacBook Pro')).toBeInTheDocument()
      })

      const pencilIcon = screen.getByTestId('icon-pencil')
      await userEvent.click(pencilIcon.closest('button')!)

      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeInTheDocument()
      })

      await userEvent.clear(screen.getByLabelText('Name'))
      await userEvent.type(screen.getByLabelText('Name'), 'New Name')
      await userEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to rename passkey')
      })
    })
  })
})
