/** Print a snapshot in an isolated document, without the app's navigation or theme. */
export function printTimesheet(content: HTMLElement, title: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;'
  const snapshot = content.cloneNode(true)
  const cleanup = () => frame.remove()
  frame.onload = () => {
    const doc = frame.contentDocument
    const view = frame.contentWindow
    if (!doc || !view) {
      cleanup()
      return
    }
    doc.title = title
    doc.documentElement.lang = document.documentElement.lang
    const style = doc.createElement('style')
    style.textContent = `
      @page { size: landscape; margin: 12mm; }
      body { font: 11px Arial, sans-serif; color: #111; background: #fff; }
      h1 { font-size: 22px; margin: 0 0 8px; }
      p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { padding: 5px 6px; border-bottom: 1px solid #ccc; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
      thead { display: table-header-group; }
      thead th { border-bottom: 2px solid #111; }
      tr { break-inside: avoid; }
      tr.group { break-after: avoid; }
      tr.group th { background: #eee; padding-top: 8px; }
      tfoot { display: table-row-group; }
      tfoot th { border-top: 2px solid #111; border-bottom: 0; font-size: 12px; }
      .num { text-align: right; white-space: nowrap; }
      .note { white-space: pre-wrap; max-width: 60mm; }
      .sign { display: flex; gap: 48px; margin-top: 56px; break-inside: avoid; }
      .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; }
      .sign div:first-child { flex: 0 0 50mm; }
    `
    doc.head.append(style)
    doc.body.append(snapshot)
    view.addEventListener('afterprint', cleanup, { once: true })
    view.focus()
    view.print()
  }
  frame.srcdoc = '<!doctype html><html><head></head><body></body></html>'
  document.body.append(frame)
  // Also clean up in browsers that do not emit afterprint for an iframe.
  window.setTimeout(cleanup, 300_000)
}
