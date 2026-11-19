import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Font } from '@react-pdf/renderer'

const fontsDir = path.join(process.cwd(), 'src/assets/fonts')

const dataUri = (file: string) =>
  `data:font/truetype;base64,${readFileSync(path.join(fontsDir, file)).toString('base64')}`

/**
 * Every family a document can use, embedded rather than named: react-pdf writes
 * the font file into the PDF, and the built-in PDF fonts are Latin-1 only,
 * which would drop Cyrillic on the floor.
 */
const FAMILIES = [
  { family: 'Roboto', regular: 'Roboto-Regular.ttf', bold: 'Roboto-Bold.ttf' },
  { family: 'Noto Serif', regular: 'NotoSerif-Regular.ttf', bold: 'NotoSerif-Bold.ttf' },
  { family: 'Noto Sans Mono', regular: 'NotoSansMono-Regular.ttf', bold: 'NotoSansMono-Bold.ttf' },
  { family: 'Open Sans', regular: 'OpenSans-Regular.ttf', bold: 'OpenSans-Bold.ttf' },
  { family: 'Lato', regular: 'Lato-Regular.ttf', bold: 'Lato-Bold.ttf' },
  { family: 'Montserrat', regular: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf' },
  { family: 'PT Sans', regular: 'PTSans-Regular.ttf', bold: 'PTSans-Bold.ttf' },
]

for (const { family, regular, bold } of FAMILIES) {
  const regularUri = dataUri(regular)
  const boldUri = dataUri(bold)
  Font.register({
    family,
    fonts: [
      { src: regularUri, fontWeight: 400 },
      { src: boldUri, fontWeight: 700 },
    ],
  })
  // A separate bold family, because the styles pick weight by family name.
  Font.register({ family: `${family}-Bold`, src: boldUri })
}

// Disable word hyphenation so Cyrillic text is not broken mid-word
Font.registerHyphenationCallback((word) => [word])

/** A registered face as react-pdf holds it: the parsed font, once it has been loaded. */
interface LoadedFace {
  data?: { characterSet?: number[]; glyphForCodePoint?: (codePoint: number) => unknown } | null
}

let primed: Promise<void> | null = null

/**
 * Resolves once every face knows which character each of its glyphs stands
 * for. Await it before every render.
 *
 * The font library keeps one glyph object per face for as long as the server
 * runs, and a glyph remembers the character it was first asked for. A colon
 * in these fonts is drawn from the full stop's outline, and writing a colon
 * into a PDF fetches that outline with no character at all. So when the first
 * document a server rendered had a colon and no full stop in some face, the
 * full stop had no character from then on: every later PDF drew it correctly
 * and could not be read back, searched or copied ("james mitchell@gmail com",
 * "$500 00"). Asking each face for all its characters first settles what
 * every glyph stands for before any document can get there.
 */
export function pdfFontsReady(): Promise<void> {
  primed ??= (async () => {
    const faces = FAMILIES.flatMap(({ family }) => [
      { fontFamily: family, fontWeight: 400 },
      { fontFamily: family, fontWeight: 700 },
      { fontFamily: `${family}-Bold` },
    ])
    for (const face of faces) {
      try {
        await Font.load(face)
        const font = (Font.getFont(face) as LoadedFace | undefined)?.data
        if (!font?.characterSet || !font.glyphForCodePoint) continue
        for (const codePoint of font.characterSet) font.glyphForCodePoint(codePoint)
      } catch (error) {
        // The document still prints; only its text layer may read wrongly.
        console.error(`[pdf] could not prepare the font ${face.fontFamily}`, error)
      }
    }
  })()
  return primed
}
