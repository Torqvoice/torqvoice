import { describe, expect, it } from 'vitest'
import {
  findServiceFormProblem,
  type ServiceFormInput,
} from '@/features/vehicles/Lib/validateServiceForm'

/**
 * What the work order editor refuses to save, and why it has to be the one
 * doing the refusing.
 *
 * The editor draws every field twice, once per breakpoint. Native form
 * validation then objects to whichever copy the screen is not using, will not
 * open a message on a hidden control, and abandons the submit in silence: a
 * Save button that does nothing at all, with an "invalid form control is not
 * focusable" line in a console nobody has open. So the form runs unvalidated
 * and these rules stand in its place.
 *
 * The two row rules are here because of what they replaced. A priced row with
 * no name used to be filtered out of the payload on the way to the server, so
 * the save succeeded, said "Saved", and quietly left the money off the
 * customer's invoice.
 */

const empty: ServiceFormInput = { title: 'Front brakes', partItems: [], laborItems: [] }

const part = (over: Partial<ServiceFormInput['partItems'][number]> = {}) => ({
  name: 'Brake pads',
  quantity: 1,
  unitCost: 0,
  unitPrice: 100,
  markupPercent: 0,
  ...over,
})

const labor = (over: Partial<ServiceFormInput['laborItems'][number]> = {}) => ({
  description: 'Replace pads',
  hours: 1,
  rate: 800,
  ...over,
})

describe('what a work order must have before it saves', () => {
  it('lets a complete job through', () => {
    expect(
      findServiceFormProblem({ ...empty, partItems: [part()], laborItems: [labor()] })
    ).toBeNull()
  })

  it('needs a title', () => {
    expect(findServiceFormProblem({ ...empty, title: '' })).toBe('title')
    expect(findServiceFormProblem({ ...empty, title: '   ' })).toBe('title')
  })

  it('refuses a part that has a price but no name', () => {
    expect(findServiceFormProblem({ ...empty, partItems: [part({ name: '' })] })).toBe('partName')
    // Whitespace is not a name either: it saved, and printed a blank line on
    // the invoice.
    expect(findServiceFormProblem({ ...empty, partItems: [part({ name: '  ' })] })).toBe('partName')
  })

  it('refuses a part that has a number or a cost but no name', () => {
    expect(
      findServiceFormProblem({
        ...empty,
        partItems: [part({ name: '', unitPrice: 0, partNumber: '8K0-698-451' })],
      })
    ).toBe('partName')
    expect(
      findServiceFormProblem({
        ...empty,
        partItems: [part({ name: '', unitPrice: 0, unitCost: 40 })],
      })
    ).toBe('partName')
  })

  it('leaves the blank row the editor keeps ready alone', () => {
    // Every list ends in an empty row waiting to be typed into. It is not a
    // mistake, and it is dropped on save without a word.
    expect(
      findServiceFormProblem({
        ...empty,
        partItems: [part(), part({ name: '', unitPrice: 0, quantity: 1 })],
        laborItems: [labor(), labor({ description: '', hours: 0, rate: 0 })],
      })
    ).toBeNull()
  })

  it('refuses labour with hours or a rate but nothing said about it', () => {
    expect(findServiceFormProblem({ ...empty, laborItems: [labor({ description: '' })] })).toBe(
      'laborDescription'
    )
    expect(
      findServiceFormProblem({ ...empty, laborItems: [labor({ description: '', hours: 0 })] })
    ).toBe('laborDescription')
  })

  it('refuses negative money and negative time', () => {
    for (const over of [{ quantity: -1 }, { unitPrice: -1 }, { unitCost: -5 }]) {
      expect(findServiceFormProblem({ ...empty, partItems: [part(over)] })).toBe('negative')
    }
    for (const over of [{ hours: -2 }, { rate: -100 }]) {
      expect(findServiceFormProblem({ ...empty, laborItems: [labor(over)] })).toBe('negative')
    }
  })

  it('allows a markup down to giving the part away, and no further', () => {
    // Selling below cost is a real decision; a price below nothing is not.
    expect(
      findServiceFormProblem({ ...empty, partItems: [part({ markupPercent: -100 })] })
    ).toBeNull()
    expect(findServiceFormProblem({ ...empty, partItems: [part({ markupPercent: -101 })] })).toBe(
      'negative'
    )
  })

  it('reads the numbers the editor holds as strings', () => {
    // Every number in the editor comes from an input, so it arrives as text.
    expect(
      findServiceFormProblem({
        ...empty,
        partItems: [part({ quantity: '2', unitPrice: '150.50' })],
        laborItems: [labor({ hours: '1.5', rate: '400' })],
      })
    ).toBeNull()
    expect(findServiceFormProblem({ ...empty, partItems: [part({ quantity: '-2' })] })).toBe(
      'negative'
    )
  })

  it('says the most fundamental thing first', () => {
    // A form with three problems gets one sentence, and fixing it brings the
    // next one up.
    expect(
      findServiceFormProblem({
        title: '',
        partItems: [part({ name: '', quantity: -1 })],
        laborItems: [labor({ description: '' })],
      })
    ).toBe('title')
  })
})
