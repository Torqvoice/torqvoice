import { getTranslations } from 'next-intl/server'
import { type AiErrorKind, describeAiError } from '@/lib/ai-error'

/**
 * `describeAiError` in the language of whoever made the request, for a line
 * that reaches a toast or the connection page. The translator is fetched
 * once, up front, so a stream that fails later still has it.
 *
 * Where there is no request to take a language from, such as a background
 * job, the line stays in English rather than the failure being lost.
 */
export async function aiErrorDescriber(): Promise<(error: unknown) => string> {
  try {
    const t = await getTranslations('integrations.aiErrors')
    return (error) => describeAiError(error, (kind: AiErrorKind) => t(kind))
  } catch {
    return (error) => describeAiError(error)
  }
}
