import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHardwareScanner } from '@/hooks/use-hardware-scanner'

function Page({ onScan, onPress }: { onScan: (code: string) => void; onPress: () => void }) {
  useHardwareScanner({ onScan })
  return (
    <button type="button" onClick={onPress}>
      Add line
    </button>
  )
}

/**
 * The scanner listens to every key on the work order and inventory pages. It
 * used to cancel every Enter, scan or not, so somebody working by keyboard
 * could not press a button or pick from a dropdown with it.
 */
describe('the hardware scanner listener', () => {
  it('leaves Enter alone when nobody scanned', () => {
    render(<Page onScan={vi.fn()} onPress={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Add line' })
    button.focus()
    // fireEvent returns false when a listener cancelled the event.
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true)
  })

  it('takes the Enter that ends a scan and reports the code', () => {
    const onScan = vi.fn()
    render(<Page onScan={onScan} onPress={vi.fn()} />)
    for (const key of '7391234') fireEvent.keyDown(document.body, { key })
    expect(fireEvent.keyDown(document.body, { key: 'Enter' })).toBe(false)
    expect(onScan).toHaveBeenCalledWith('7391234')
  })
})
