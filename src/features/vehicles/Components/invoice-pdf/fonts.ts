import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Font } from '@react-pdf/renderer'

const fontsDir = path.join(process.cwd(), 'src/assets/fonts')
const regularDataUri = `data:font/truetype;base64,${readFileSync(path.join(fontsDir, 'Roboto-Regular.ttf')).toString('base64')}`
const boldDataUri = `data:font/truetype;base64,${readFileSync(path.join(fontsDir, 'Roboto-Bold.ttf')).toString('base64')}`

Font.register({
  family: 'Roboto',
  fonts: [
    { src: regularDataUri, fontWeight: 400 },
    { src: boldDataUri, fontWeight: 700 },
  ],
})

Font.register({
  family: 'Roboto-Bold',
  src: boldDataUri,
})

// Disable word hyphenation so Cyrillic text is not broken mid-word
Font.registerHyphenationCallback((word) => [word])
