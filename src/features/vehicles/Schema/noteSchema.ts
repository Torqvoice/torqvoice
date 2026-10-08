import { z } from 'zod'
import { sanitizeHtml } from '@/lib/sanitize-html'

/**
 * A note is HTML from the rich text editor, and the vehicle page renders it as
 * HTML. The editor is only a convenience on the client; the action takes any
 * string, so the string is cleaned here, where every path through the action
 * meets it, and not only where it happens to be typed.
 */
const noteContent = z.string().min(1, 'Content is required').transform(sanitizeHtml)

export const createNoteSchema = z.object({
  vehicleId: z.string(),
  title: z.string().min(1, 'Title is required'),
  content: noteContent,
  isPinned: z.boolean().default(false),
})

// A note stays on the vehicle it was written for; moving one to a vehicle the
// caller never proved is theirs is not an edit.
export const updateNoteSchema = createNoteSchema.omit({ vehicleId: true }).partial().extend({
  id: z.string(),
})

export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>
