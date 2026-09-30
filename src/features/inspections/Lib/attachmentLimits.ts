/**
 * How many files an inspection holds on itself, per kind. One answer for the
 * desk's card, the server action behind it and the phone route, so the page
 * never offers room the server then refuses.
 */
export const INSPECTION_ATTACHMENT_LIMITS = {
  image: 100,
  document: 20,
  video: 10,
} as const

export type InspectionAttachmentKind = keyof typeof INSPECTION_ATTACHMENT_LIMITS

/** Photos on one check. */
export const INSPECTION_ITEM_PHOTO_LIMIT = 20
