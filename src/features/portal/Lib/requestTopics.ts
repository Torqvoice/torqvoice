import 'server-only'

import bg from '../../../../messages/bg/portal.json'
import de from '../../../../messages/de/portal.json'
import en from '../../../../messages/en/portal.json'
import es from '../../../../messages/es/portal.json'
import fr from '../../../../messages/fr/portal.json'
import it from '../../../../messages/it/portal.json'
import lt from '../../../../messages/lt/portal.json'
import nb from '../../../../messages/nb/portal.json'
import nl from '../../../../messages/nl/portal.json'
import pl from '../../../../messages/pl/portal.json'
import ptBR from '../../../../messages/pt-BR/portal.json'
import ptPT from '../../../../messages/pt-PT/portal.json'
import ru from '../../../../messages/ru/portal.json'
import tr from '../../../../messages/tr/portal.json'

/**
 * Every label a quick choice on the booking page can have ("Service",
 * "Bremser", "Algo no va bien"), in every language the portal speaks.
 *
 * The booking form stores the chosen label as the first line of the request,
 * in the customer's language, and a request has no column that says a choice
 * was made. So a first line is a choice only when it is exactly one of these:
 * read from the message files themselves (`portal.book.topics`), so a new
 * choice or a corrected translation is known here without anyone remembering
 * to add it. A test fails when a locale is missing from this list.
 *
 * Server only: this pulls every locale's portal messages in, which must
 * never reach a browser.
 */
const PORTAL_MESSAGES = [bg, de, en, es, fr, it, lt, nb, nl, pl, ptBR, ptPT, ru, tr]

export const REQUEST_TOPIC_LABELS: ReadonlySet<string> = new Set(
  PORTAL_MESSAGES.flatMap((messages) => Object.values(messages.book.topics)).map((label) =>
    label.trim()
  )
)
