/**
 * A portal page that has only one thing to say: this portal does not exist,
 * it is not open, the home could not be loaded. A heading, a sentence and,
 * when there is something to do about it, the buttons for that. Centred in
 * the screen, in the theme's type.
 */
export function PortalPlainScreen({
  title,
  body,
  children,
}: {
  title: string
  body: string
  /** Buttons or links under the sentence. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-2 text-center">
        <h1 className="p-display text-[28px]">{title}</h1>
        <p className="p-muted text-base leading-normal">{body}</p>
        {children && <div className="mt-4 flex w-full flex-col gap-2.5">{children}</div>}
      </div>
    </div>
  )
}
