import { describe, expect, it } from 'vitest'
import { createNoteSchema, updateNoteSchema } from '@/features/vehicles/Schema/noteSchema'

/**
 * A note is HTML the vehicle page renders as HTML. The editor is a client
 * convenience; the action accepts any string, so the schema has to be where
 * the string is made safe.
 */
describe('vehicle note content', () => {
  it('keeps what the editor produces', () => {
    const parsed = createNoteSchema.parse({
      vehicleId: 'v1',
      title: 'Brakes',
      content: '<p>Front pads at <strong>3 mm</strong></p><ul><li>order</li></ul>',
    })
    expect(parsed.content).toBe('<p>Front pads at <strong>3 mm</strong></p><ul><li>order</li></ul>')
  })

  it('strips script, handlers and foreign tags on the way in', () => {
    const parsed = createNoteSchema.parse({
      vehicleId: 'v1',
      title: 'x',
      content:
        '<p onclick="steal()">hi</p><img src=x onerror="fetch(\'/api\')"><script>steal()</script>',
    })
    expect(parsed.content).toBe('<p>hi</p>steal()')
    expect(parsed.content).not.toMatch(/onerror|onclick|<img|<script/)
  })

  it('cleans an edit the same way', () => {
    const parsed = updateNoteSchema.parse({
      id: 'n1',
      content: '<iframe src="javascript:alert(1)"></iframe><em>ok</em>',
    })
    expect(parsed.content).toBe('<em>ok</em>')
  })

  it('does not let an edit move the note to another vehicle', () => {
    const parsed = updateNoteSchema.parse({ id: 'n1', vehicleId: 'other', title: 't' })
    expect('vehicleId' in parsed).toBe(false)
  })
})
