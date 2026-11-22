/**
 * The vehicle form's "Scan registration document" and plate lookup buttons
 * when they cannot be used: the reason is written beside them, where a phone
 * shows it too, with a way to switch the feature on for whoever may change
 * settings, and the scan hint no longer promises fields that fill themselves.
 * When they can be used, nothing of that shows.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const getVehicleScanAvailability = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/aiAnalyzeVehicleDocument', () => ({
  aiAnalyzeVehicleDocument: vi.fn(),
  getVehicleScanAvailability,
}))
const getVehicleLookupAvailability = vi.hoisted(() => vi.fn())
vi.mock('@/features/integrations/Actions/vehicleLookupActions', () => ({
  getVehicleLookupAvailability,
  lookupVehicle: vi.fn(),
}))
const handleGated = vi.hoisted(() => vi.fn())
vi.mock('@/components/upgrade-gate', () => ({ handleGated }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() } }))

import { TooltipProvider } from '@/components/ui/tooltip'
import { ScanDocumentButton } from '@/features/vehicles/Components/ScanDocumentButton'
import { VehicleLookupButton } from '@/features/vehicles/Components/VehicleLookupButton'

const HINT = 'Photograph the vehicle papers and the fields fill in automatically.'

function renderScan() {
  return render(
    <TooltipProvider>
      <ScanDocumentButton onScanned={vi.fn()} stacked />
    </TooltipProvider>
  )
}

function renderLookup() {
  return render(
    <TooltipProvider>
      <VehicleLookupButton by="plate" text="Look up" getValue={() => ''} onFound={vi.fn()} />
    </TooltipProvider>
  )
}

const scanButton = () => screen.getByRole('button', { name: /Scan registration document/ })
const lookupButton = () => screen.getByRole('button', { name: 'Look up plate' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scan registration document', () => {
  it('says AI is missing and links to the AI providers for someone who may change settings', async () => {
    getVehicleScanAvailability.mockResolvedValue({
      success: true,
      data: { available: false, reason: 'notConfigured', canEditSettings: true },
    })
    renderScan()
    expect(await screen.findByText(/Scanning needs an AI provider\./)).toBeVisible()
    expect(scanButton()).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Set up AI' })).toHaveAttribute(
      'href',
      '/settings/integrations?category=ai'
    )
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('gives the reason without a link to someone who may not change settings', async () => {
    getVehicleScanAvailability.mockResolvedValue({
      success: true,
      data: { available: false, reason: 'notConfigured', canEditSettings: false },
    })
    renderScan()
    expect(
      await screen.findByText('Scanning needs an AI provider. Ask an admin to set one up.')
    ).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('offers the plans when the plan leaves AI out', async () => {
    getVehicleScanAvailability.mockResolvedValue({
      success: true,
      data: { available: false, reason: 'notInPlan', canEditSettings: true },
    })
    renderScan()
    expect(await screen.findByText(/Scanning is not included in your plan\./)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'View Plans' }))
    expect(handleGated).toHaveBeenCalledWith({ gated: { feature: 'ai' } })
  })

  it('shows the hint and no reason when scanning is available', async () => {
    getVehicleScanAvailability.mockResolvedValue({
      success: true,
      data: { available: true, reason: null, canEditSettings: true },
    })
    renderScan()
    await waitFor(() => expect(scanButton()).toBeEnabled())
    expect(screen.getByText(HINT)).toBeVisible()
    expect(screen.queryByText(/needs an AI provider/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('plate lookup', () => {
  it('says no registry is connected and links to the registries for someone who may change settings', async () => {
    getVehicleLookupAvailability.mockResolvedValue({
      success: true,
      data: { plate: false, vin: false, reason: 'notConnected', canEditSettings: true },
    })
    renderLookup()
    expect(await screen.findByText(/Plate lookup needs a vehicle registry\./)).toBeVisible()
    expect(lookupButton()).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Connect one' })).toHaveAttribute(
      'href',
      '/settings/integrations?category=registry'
    )
  })

  it('gives the reason without a link to someone who may not change settings', async () => {
    getVehicleLookupAvailability.mockResolvedValue({
      success: true,
      data: { plate: false, vin: false, reason: 'notConnected', canEditSettings: false },
    })
    renderLookup()
    expect(
      await screen.findByText('Plate lookup needs a vehicle registry. Ask an admin to connect one.')
    ).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers the plans when the plan leaves integrations out', async () => {
    getVehicleLookupAvailability.mockResolvedValue({
      success: true,
      data: { plate: false, vin: false, reason: 'notInPlan', canEditSettings: true },
    })
    renderLookup()
    expect(await screen.findByText(/Plate lookup is not included in your plan\./)).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Plans' }))
    expect(handleGated).toHaveBeenCalledWith({ gated: { feature: 'integrations' } })
  })

  it('shows no reason when a registry is connected', async () => {
    getVehicleLookupAvailability.mockResolvedValue({
      success: true,
      data: { plate: true, vin: false, reason: null, canEditSettings: true },
    })
    renderLookup()
    await waitFor(() => expect(lookupButton()).toBeEnabled())
    expect(screen.queryByText(/vehicle registry/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not included in your plan/)).not.toBeInTheDocument()
  })
})
