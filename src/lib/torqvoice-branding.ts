import { readFile } from 'fs/promises'
import { join } from 'path'

let cachedDataUri: string | undefined

export async function getTorqvoiceLogoDataUri(): Promise<string | undefined> {
  if (cachedDataUri) return cachedDataUri

  try {
    const logoPath = join(process.cwd(), 'public', 'torqvoice_app_logo.png')
    const buffer = await readFile(logoPath)
    cachedDataUri = `data:image/png;base64,${buffer.toString('base64')}`
    return cachedDataUri
  } catch {
    return undefined
  }
}
