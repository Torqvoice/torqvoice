import { Font } from '@react-pdf/renderer'

/** Mirrors the server list in fonts.ts; the preview must offer the same set. */
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
  Font.register({
    family,
    fonts: [
      { src: `/fonts/${regular}`, fontWeight: 400 },
      { src: `/fonts/${bold}`, fontWeight: 700 },
    ],
  })
  Font.register({ family: `${family}-Bold`, src: `/fonts/${bold}` })
}

Font.registerHyphenationCallback((word) => [word])
