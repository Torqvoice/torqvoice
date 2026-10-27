import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const getMemberSeats = vi.fn()
vi.mock('@/features/team/Actions/getMemberSeats', () => ({
  getMemberSeats: () => getMemberSeats(),
}))
const inviteMember = vi.fn()
vi.mock('@/features/team/Actions/teamActions', () => ({
  inviteMember: (input: unknown) => inviteMember(input),
}))
const handleGated = vi.fn((_result: unknown) => true)
vi.mock('@/components/upgrade-gate', () => ({
  handleGated: (result: unknown) => handleGated(result),
}))
vi.mock('@/features/team/Actions/createAppSetupCode', () => ({
  createAppSetupCode: vi.fn(),
  revokeAppSetupCode: vi.fn(),
}))
vi.mock('@/features/team/Actions/createTechnicianAccount', () => ({
  createTechnicianAccount: vi.fn(),
  getWorkshopDialCode: vi.fn(),
}))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({ createTechnician: vi.fn() }))
vi.mock('@/features/team/Actions/getRoles', () => ({ getRoles: vi.fn() }))
vi.mock('@/features/team/Actions/createDefaultRoles', () => ({ createDefaultRoles: vi.fn() }))
vi.mock('@/features/team/hooks/useTechnicianConnected', () => ({
  useTechnicianConnected: vi.fn(),
}))

import { AddPersonDialog } from '@/features/team/Components/AddPersonDialog'

const OFFICE = 'Someone in the office'

function renderDialog() {
  return render(
    <AddPersonDialog
      open
      onOpenChange={vi.fn()}
      dialCode="+47"
      roles={[{ id: 'role-desk', name: 'Desk' }]}
      onChanged={vi.fn()}
    />
  )
}

function officeChoice() {
  return screen.getByRole('button', { name: new RegExp(OFFICE) })
}

describe('AddPersonDialog, office seats', () => {
  beforeEach(() => {
    getMemberSeats.mockReset()
    inviteMember.mockReset()
    handleGated.mockClear()
  })

  it('says the plan is full before any address is typed, and offers the upgrade', async () => {
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 1, full: true } })
    renderDialog()

    await waitFor(() => expect(officeChoice()).toHaveAttribute('data-locked', 'true'))
    expect(officeChoice()).toHaveTextContent(
      'Your plan includes one team member. Upgrade to invite more people.'
    )

    fireEvent.click(officeChoice())
    expect(handleGated).toHaveBeenCalledWith({ gated: { feature: 'maxUsers', limit: 1 } })
    expect(screen.queryByLabelText('Invite by Email')).toBeNull()
  })

  it('opens the invite form while a seat is free', async () => {
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 5, full: false } })
    renderDialog()
    await waitFor(() => expect(getMemberSeats).toHaveBeenCalled())

    fireEvent.click(officeChoice())
    expect(handleGated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Invite by Email')).toBeInTheDocument()
  })

  it('still opens the form when the seat answer has not arrived', () => {
    // An answer that never arrives
    getMemberSeats.mockReturnValue(new Promise(vi.fn()))
    renderDialog()

    fireEvent.click(officeChoice())
    expect(screen.getByLabelText('Invite by Email')).toBeInTheDocument()
  })
})

describe('AddPersonDialog, invite address', () => {
  beforeEach(() => {
    getMemberSeats.mockReset()
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 5, full: false } })
    inviteMember.mockReset()
    inviteMember.mockResolvedValue({ success: true, data: { invited: true } })
  })

  async function openForm() {
    renderDialog()
    await waitFor(() => expect(getMemberSeats).toHaveBeenCalled())
    fireEvent.click(officeChoice())
    return screen.getByLabelText('Invite by Email')
  }

  it('refuses an address the server would refuse, in words, without asking it', async () => {
    const field = await openForm()
    // The browser's type="email" lets this through; the server does not
    fireEvent.change(field, { target: { value: 'kari@gmail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    expect(
      await screen.findByText('Check the email address. It should look like name@example.com.')
    ).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(inviteMember).not.toHaveBeenCalled()
  })

  it('clears the message once the address is being corrected', async () => {
    const field = await openForm()
    fireEvent.change(field, { target: { value: 'kari@gmail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await screen.findByText(/Check the email address/)

    fireEvent.change(field, { target: { value: 'kari@gmail.com' } })
    expect(screen.queryByText(/Check the email address/)).toBeNull()
  })

  it('sends a good address on to the invite action', async () => {
    const field = await openForm()
    fireEvent.change(field, { target: { value: ' kari@gmail.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'kari@gmail.com' })
      )
    )
  })
})
