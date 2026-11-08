// @vitest-environment node
/**
 * The notes on a printed invoice. AI Write saves its explanation as plain
 * lines joined by <br>, with no paragraphs; such a note printed as an empty
 * Notes box the height of a page. Each note here is printed to a real PDF and
 * its words read back out of it.
 */
import { Document, Page, renderToBuffer } from '@react-pdf/renderer'
import { extractText } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { HtmlToPdf } from '@/features/vehicles/Components/invoice-pdf/Notes'

async function printed(html: string): Promise<string> {
  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4">
        <HtmlToPdf html={html} baseStyle={{ fontSize: 9 }} fontBold="Helvetica-Bold" />
      </Page>
    </Document>
  )
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
  return text
}

describe('notes on the invoice PDF', () => {
  it('prints a note written as lines with breaks, as AI Write saves it', async () => {
    const text = await printed(
      'SERVICE DESCRIPTION<br><br>Vehicle: 2023 Toyota Camry XSE<br>We replaced the <strong>front brake pads</strong>.'
    )
    expect(text).toContain('SERVICE DESCRIPTION')
    expect(text).toContain('Vehicle: 2023 Toyota Camry XSE')
    expect(text).toContain('front brake pads')
  })

  it('still prints paragraphs, lists and the words between them', async () => {
    const text = await printed(
      '<p>First paragraph.</p>Loose words between.<ul><li>A listed part</li></ul><blockquote>Quoted line</blockquote>'
    )
    expect(text).toContain('First paragraph.')
    expect(text).toContain('Loose words between.')
    expect(text).toContain('A listed part')
    expect(text).toContain('Quoted line')
  })

  it('prints a deeply nested quote once, without the work doubling per level', async () => {
    const depth = 22
    const html = `${'<blockquote>'.repeat(depth)}Deep quote${'</blockquote>'.repeat(depth)}`
    const text = await printed(html)
    expect(text.match(/Deep quote/g)).toHaveLength(1)
  })
})
