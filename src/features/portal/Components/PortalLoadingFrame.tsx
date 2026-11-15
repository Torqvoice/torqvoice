/**
 * The portal's frame while a page loads: a bar where the header will be, the
 * page box with a title, and room for the phone's bottom navigation, as quiet
 * placeholders in the theme's own colours, so nothing jumps when the page
 * arrives. Each route's loading.tsx fills the body with its own shape.
 *
 * It knows nothing of the session (a loading screen is drawn before anything
 * is read), so it draws no navigation, only where it will be.
 */
export function PortalLoadingFrame({
  children,
  title = true,
}: {
  children: React.ReactNode
  title?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <div className="sticky top-0 z-30 border-b bg-[var(--p-surface)]">
        <div className="flex h-[var(--p-chrome-top)] items-center gap-3 px-4 sm:px-6 lg:px-10">
          <div className="p-skeleton h-9 w-9" />
          <div className="p-skeleton h-4 w-36" />
          <div className="p-skeleton ml-auto h-11 w-11 rounded-full" />
        </div>
      </div>
      <main className="p-page flex-1">
        {title && (
          <div className="mb-6 space-y-2">
            <div className="p-skeleton h-7 w-48" />
            <div className="p-skeleton h-4 w-64 max-w-full" />
          </div>
        )}
        {children}
      </main>
      <div
        aria-hidden
        className="h-[calc(var(--p-chrome-bottom)+env(safe-area-inset-bottom))] shrink-0"
      />
      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-30 h-[calc(var(--p-chrome-bottom)+env(safe-area-inset-bottom))] border-t bg-[var(--p-surface)] lg:hidden"
      />
    </div>
  )
}

/** A stack of card rows, the shape of every portal list on a phone. */
export function PortalListSkeleton({ rows = 5, tabs = false }: { rows?: number; tabs?: boolean }) {
  return (
    <div className="space-y-2">
      {tabs && <div className="p-skeleton mb-6 h-11 w-full sm:w-80" />}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="p-skeleton h-4 w-40" />
            <div className="p-skeleton h-4 w-16" />
          </div>
          <div className="mt-3 flex gap-3">
            <div className="p-skeleton h-3 w-20" />
            <div className="p-skeleton h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The shape of a detail page (an invoice, a quote, an inspection, a car): a
 * back link and a title, then the document on the left and its summary in a
 * column on the right on a desk, the summary first on a phone. Use it inside
 * `PortalLoadingFrame title={false}`: it draws its own heading.
 */
export function PortalDetailSkeleton({ sheet = false }: { sheet?: boolean }) {
  return (
    <div>
      <div className="mb-6 space-y-3">
        <div className="p-skeleton h-4 w-32" />
        <div className="p-skeleton h-9 w-72 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 lg:order-1">
          {sheet ? (
            <div className="p-skeleton aspect-[1/1.414] w-full rounded-[var(--p-radius)]" />
          ) : (
            <div className="space-y-4">
              <div className="p-skeleton h-28 w-full rounded-[var(--p-radius)]" />
              <div className="p-skeleton h-56 w-full rounded-[var(--p-radius)]" />
              <div className="p-skeleton h-56 w-full rounded-[var(--p-radius)]" />
            </div>
          )}
        </div>
        <div className="p-panel order-1 space-y-4 lg:order-2">
          <div className="p-skeleton h-3 w-24" />
          <div className="p-skeleton h-9 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <div className="p-skeleton h-4 w-24" />
              <div className="p-skeleton h-4 w-20" />
            </div>
          ))}
          <div className="p-skeleton h-[46px] w-full rounded-[var(--p-radius-control)]" />
        </div>
      </div>
    </div>
  )
}

/** The shape of the booking page: the form beside its side column. */
export function PortalFormSkeleton() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-7">
      <div className="p-panel space-y-7 sm:p-9">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-skeleton h-16 rounded-[var(--p-radius-field)]" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-skeleton h-11 w-28 rounded-[var(--p-radius-control)]" />
          ))}
        </div>
        <div className="p-skeleton h-28 w-full rounded-[var(--p-radius-field)]" />
        <div className="p-skeleton h-[108px] w-full rounded-[var(--p-radius-field)]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-skeleton h-12 rounded-[var(--p-radius-field)]" />
          <div className="p-skeleton h-12 rounded-[var(--p-radius-field)]" />
        </div>
        <div className="p-skeleton h-14 w-full rounded-[var(--p-radius-control)] sm:w-64" />
      </div>
      <div className="space-y-5">
        <div className="p-skeleton h-48 rounded-[var(--p-radius)]" />
        <div className="p-skeleton h-64 rounded-[var(--p-radius)]" />
      </div>
    </div>
  )
}
