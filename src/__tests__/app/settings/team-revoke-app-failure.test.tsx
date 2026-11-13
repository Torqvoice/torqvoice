/**
 * Signing somebody out of the technician app on the team page. That is two
 * calls: one takes the app off their phone, the next takes them off the
 * board. The first one's answer used to be ignored, so a refusal or a dropped
 * connection there still went on to say they had been signed out, while
 * their phone kept working.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { GlassModal, useGlassModal } from '@/components/glass-modal'
import { TooltipProvider } from '@/components/ui/tooltip'

const removeTechnicianAccess = vi.fn()
const setMemberTechnician = vi.fn()
const router = { refresh: vi.fn(), push: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/team/Actions/removeTechnicianAccess', () => ({
  removeTechnicianAccess: (input: unknown) => removeTechnicianAccess(input),
}))
vi.mock('@/features/team/Actions/setMemberTechnician', () => ({
  setMemberTechnician: (input: unknown) => setMemberTechnician(input),
}))
vi.mock('@/features/team/Actions/teamActions', () => ({
  createOrganization: vi.fn(),
  removeMember: vi.fn(),
}))
vi.mock('@/features/team/Actions/cancelInvitation', () => ({ cancelInvitation: vi.fn() }))
vi.mock('@/features/team/Actions/resendInvitation', () => ({ resendInvitation: vi.fn() }))
vi.mock('@/features/team/Actions/createRole', () => ({ createRole: vi.fn() }))
vi.mock('@/features/team/Actions/updateRole', () => ({ updateRole: vi.fn() }))
vi.mock('@/features/team/Actions/deleteRole', () => ({ deleteRole: vi.fn() }))
vi.mock('@/features/team/Actions/assignRole', () => ({ assignRole: vi.fn() }))
vi.mock('@/features/team/Actions/createDefaultRoles', () => ({ createDefaultRoles: vi.fn() }))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({ deleteTechnician: vi.fn() }))
vi.mock('@/components/upgrade-gate', () => ({ handleGated: () => false }))
// Dialogs of their own; closed throughout.
vi.mock('@/features/team/Components/AddPersonDialog', () => ({ AddPersonDialog: () => null }))
vi.mock('@/features/team/Components/AppSetupCodeDialog', () => ({
  AppSetupCodeDialog: () => null,
}))
vi.mock('@/features/team/Components/GiveAppDialog', () => ({ GiveAppDialog: () => null }))

import { TeamSettings } from '@/app/(authenticated)/settings/team/team-settings'

const MECHANIC = {
  id: 'm2',
  role: 'member',
  roleId: null,
  customRoleName: null,
  user: { id: 'u2', name: 'Kari Mekaniker', email: 'kari@example.com' },
}

function renderPage() {
  render(
    <TooltipProvider>
      <ConfirmProvider>
        <TeamSettings
          organization={{ id: 'org1', name: 'Berg Motor', members: [MECHANIC] }}
          currentRole="owner"
          technicianUserIds={['u2']}
        />
        <GlassModal />
      </ConfirmProvider>
    </TooltipProvider>
  )
}

async function signOutOfApp() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign them out of the app?' }))
  const question = await screen.findByRole('alertdialog')
  await act(async () => {
    fireEvent.click(within(question).getByRole('button', { name: 'Sign them out' }))
  })
}

describe('signing a mechanic out of the app', () => {
  beforeEach(() => {
    removeTechnicianAccess.mockReset()
    setMemberTechnician.mockReset()
    setMemberTechnician.mockResolvedValue({ success: true, data: {} })
    vi.mocked(toast.success).mockClear()
    router.refresh.mockClear()
    act(() => useGlassModal.getState().close())
  })

  it('says they are signed out once both steps went through', async () => {
    removeTechnicianAccess.mockResolvedValue({ success: true, data: {} })
    renderPage()

    await signOutOfApp()

    expect(setMemberTechnician).toHaveBeenCalledWith({ userId: 'u2', enabled: false })
    expect(toast.success).toHaveBeenCalledWith('Kari Mekaniker has been signed out of the app')
  })

  it('stops and says why when the server refuses to take the app back', async () => {
    removeTechnicianAccess.mockResolvedValue({
      success: false,
      error: 'That technician is not part of this workshop.',
    })
    renderPage()

    await signOutOfApp()

    expect(
      await screen.findByText('That technician is not part of this workshop.')
    ).toBeInTheDocument()
    expect(setMemberTechnician).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('stops and says it could not when the connection drops', async () => {
    removeTechnicianAccess.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    renderPage()

    await signOutOfApp()

    expect(await screen.findByText('Could not change that')).toBeInTheDocument()
    expect(setMemberTechnician).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
