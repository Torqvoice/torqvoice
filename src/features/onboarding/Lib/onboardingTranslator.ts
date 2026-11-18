import { createTranslator } from 'next-intl'
import type { Translator } from './onboardingDefaults'

/**
 * The onboarding texts in a given language. The request's own translator
 * always speaks the language of the owner's screens, whatever locale it is
 * asked for, so the workshop's language is read from its own messages file:
 * sample jobs, labour presets and parts are printed on its documents.
 */
export async function onboardingTranslator(locale: string): Promise<Translator> {
  const messages = (await import(`../../../../messages/${locale}/onboarding.json`)).default
  return createTranslator({
    locale,
    messages: { onboarding: messages },
    namespace: 'onboarding',
  } as Parameters<typeof createTranslator>[0]) as unknown as Translator
}
