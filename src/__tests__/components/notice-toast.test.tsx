import { fireEvent, render, screen } from '@testing-library/react'
import { RefreshCw } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const custom = vi.fn()
const dismiss = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    custom: (...args: unknown[]) => custom(...args),
    dismiss: (...args: unknown[]) => dismiss(...args),
  },
}))

import { NoticeToast, showNotice } from '@/components/notice-toast'

const notice = {
  icon: RefreshCw,
  title: 'A new version is available',
  description: 'Reload the page to get the latest updates.',
  actionLabel: 'Reload',
  dismissLabel: 'Dismiss',
}

describe('NoticeToast', () => {
  beforeEach(() => {
    custom.mockReset()
    dismiss.mockReset()
  })

  it('says what happened and offers the one thing to do about it', () => {
    const onAction = vi.fn()
    render(<NoticeToast toastId="t1" {...notice} onAction={onAction} />)

    expect(screen.getByRole('status')).toHaveTextContent('A new version is available')
    expect(screen.getByText('Reload the page to get the latest updates.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('closes itself and nothing else', () => {
    const onAction = vi.fn()
    render(<NoticeToast toastId="t1" {...notice} onAction={onAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismiss).toHaveBeenCalledWith('t1')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('stays up until it is acted on, one per kind of notice', () => {
    showNotice({ id: 'app-update', ...notice, onAction: vi.fn() })

    expect(custom).toHaveBeenCalledWith(expect.any(Function), {
      id: 'app-update',
      duration: Number.POSITIVE_INFINITY,
      unstyled: true,
    })
    const renderCard = custom.mock.calls[0][0] as (id: string) => React.ReactElement
    render(renderCard('app-update'))
    expect(screen.getByTestId('notice-toast')).toHaveTextContent('Reload')
  })
})
