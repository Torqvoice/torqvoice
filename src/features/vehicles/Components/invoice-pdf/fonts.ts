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
