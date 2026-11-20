/**
 * A box drawn on the sheet keeps its colour in one form, with or without a
 * picture behind it. Switching the vehicle photo on and off in the designer
 * re-renders the same box; mixing the `background` shorthand with the
 * picture's longhands made React warn about conflicting styles each time.
 */
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boxCss } from '@/features/invoice-designer/Render/renderHtml'

afterEach(() => vi.restoreAllMocks())

function Box({ image }: { image?: string }) {
  return <div data-testid="box" style={boxCss({ background: '#f1f5f9', backgroundImage: image })} />
}

describe('a box with a background colour', () => {
  it('uses the colour longhand, picture or not', () => {
    expect(boxCss({ background: '#f1f5f9' })).not.toHaveProperty('background')
    expect(boxCss({ background: '#f1f5f9' }).backgroundColor).toBe('#f1f5f9')
    expect(
      boxCss({ background: '#f1f5f9', backgroundImage: 'data:image/png;base64,AA==' })
    ).toMatchObject({
      backgroundColor: '#f1f5f9',
      backgroundSize: 'cover',
    })
  })

  it('gains and loses its picture without a style warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender, getByTestId } = render(<Box image="data:image/png;base64,AA==" />)
    rerender(<Box />)
    rerender(<Box image="data:image/png;base64,AA==" />)
    expect(error).not.toHaveBeenCalled()
    expect(getByTestId('box').style.backgroundColor).not.toBe('')
  })
})
