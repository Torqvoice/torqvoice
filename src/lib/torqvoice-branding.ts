import { readFile } from 'fs/promises'
import { join } from 'path'

let cachedDataUri: string | undefined

export async function getTorqvoiceLogoDataUri(): Promise<string | undefined> {
  if (cachedDataUri) return cachedDataUri

  try {
    const logoPath = join(process.cwd(), 'public', 'logo-taller-el-moni.jpg')
    const buffer = await readFile(logoPath)
    cachedDataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`
    return cachedDataUri
  } catch {
    return undefined
  }
}
