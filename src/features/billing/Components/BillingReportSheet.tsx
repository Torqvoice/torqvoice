'use client'

import {
  labelSpan,
  type ReportCell,
  type ReportModel,
} from '@/features/billing/Lib/billingReportModel'

/**
 * The billing report as a printed page. Styled by printBillingReport (an
 * isolated document, black on white), not by the app, so the class names
 * here are its own.
 */
export function BillingReportSheet({ model }: { model: ReportModel }) {
  const span = labelSpan(model)
  const width = model.headers.length

  const amounts = (cells: ReportCell[], from: number) =>
    model.headers.slice(from).map((h, i) => (
      <td key={h.column} className={h.numeric ? 'num' : undefined}>
        {cells[i + from]?.text}
      </td>
    ))

  const totalsRow = (label: string, cells: ReportCell[], className: string) =>
    span > 0 ? (
      <tr className={className}>
        <th scope="row" colSpan={span}>
          {label}
        </th>
        {amounts(cells, span)}
      </tr>
    ) : (
      <>
        <tr className={`${className} label`}>
          <th scope="row" colSpan={width}>
            {label}
          </th>
        </tr>
        <tr className={className}>{amounts(cells, 0)}</tr>
      </>
    )

  return (
    <div>
      <header className="head">
        <div className="brand">
          {model.logo && <img className="logo" src={model.logo} alt="" />}
          <div>
            <div className="name">{model.workshopName}</div>
            {model.workshopLines.map((line) => (
              <div key={line} className="muted">
                {line}
              </div>
            ))}
          </div>
        </div>
        <div className="title">
          <h1>{model.title}</h1>
          <div className="muted">{model.generated}</div>
        </div>
      </header>

      <div className="chips">
        {model.chips.map((chip) => (
          <span key={chip.label} className="chip">
            <b>{chip.label}</b>
            {chip.value ? `: ${chip.value}` : ''}
          </span>
        ))}
      </div>

      <div className="summary">
        {model.summary.map((item) => (
          <div key={item.label} className={item.emphasis ? 'box strong' : 'box'}>
            {item.label}
            <b>{item.value}</b>
          </div>
        ))}
      </div>
      {model.notice && <p className="notice">{model.notice}</p>}

      <table>
        <thead>
          <tr>
            {model.headers.map((h) => (
              <th key={h.column} scope="col" className={h.numeric ? 'num' : undefined}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        {model.sections.map((section, index) => (
          <tbody key={index}>
            {section.heading && (
              <tr className="group">
                <th scope="rowgroup" colSpan={width}>
                  {section.heading}
                </th>
              </tr>
            )}
            {section.rows.map((cells, rowIndex) => (
              <tr key={rowIndex}>
                {model.headers.map((h, i) => (
                  <td key={h.column} className={h.numeric ? 'num' : undefined}>
                    {cells[i].text}
                  </td>
                ))}
              </tr>
            ))}
            {section.subtotal && totalsRow(section.label ?? '', section.subtotal, 'subtotal')}
          </tbody>
        ))}
        <tbody className="grand">{totalsRow(model.totalLabel, model.total, 'total')}</tbody>
      </table>
    </div>
  )
}

/** A CSS string literal, for the page's running footer. */
function cssString(text: string) {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
}

/**
 * Prints the sheet in an isolated document, without the app's navigation or
 * theme, and waits for the logo first. `pageLabel` is "Page {page} of
 * {pages}" in the viewer's language; browsers that draw page margins put it
 * and the footer at the foot of every page.
 */
export function printBillingReport(content: HTMLElement, model: ReportModel, pageLabel: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;'
  const snapshot = content.cloneNode(true)
  const cleanup = () => frame.remove()
  const pages = pageLabel
    .split(/(\{page\}|\{pages\})/)
    .filter(Boolean)
    .map((part) =>
      part === '{page}' ? 'counter(page)' : part === '{pages}' ? 'counter(pages)' : cssString(part)
    )
    .join(' ')
  frame.onload = () => {
    const doc = frame.contentDocument
    const view = frame.contentWindow
    if (!doc || !view) {
      cleanup()
      return
    }
    doc.title = model.fileName
    doc.documentElement.lang = document.documentElement.lang
    const style = doc.createElement('style')
    style.textContent = `
      @page {
        size: A4 landscape;
        margin: 12mm 12mm 16mm;
        @bottom-left { content: ${cssString(model.footer)}; font: 8px Arial, sans-serif; color: #666; }
        @bottom-right { content: ${pages}; font: 8px Arial, sans-serif; color: #666; }
      }
      * { box-sizing: border-box; }
      body { margin: 0; font: 10px Arial, sans-serif; color: #111; background: #fff; }
      .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 8px; }
      .brand { display: flex; gap: 10px; align-items: center; min-width: 0; }
      .logo { max-width: 120px; max-height: 48px; object-fit: contain; }
      .name { font-size: 15px; font-weight: bold; }
      .muted { color: #555; margin-top: 2px; }
      .title { text-align: right; }
      h1 { font-size: 18px; margin: 0; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .chip { border: 1px solid #999; border-radius: 3px; padding: 2px 6px; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; break-inside: avoid; }
      .box { border: 1px solid #ccc; border-radius: 3px; padding: 6px 8px; }
      .box b { display: block; font-size: 13px; margin-top: 2px; }
      .box.strong { border: 2px solid #111; }
      .notice { font-style: italic; margin: 8px 0 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font: inherit; }
      th, td { padding: 4px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      thead { display: table-header-group; }
      thead th { border-bottom: 2px solid #111; font-size: 9px; text-transform: uppercase; }
      tr { break-inside: avoid; }
      tr.group { break-after: avoid; }
      tr.group th { background: #eee; padding-top: 7px; }
      tr.subtotal td, tr.subtotal th { font-style: italic; border-bottom: 1px solid #999; }
      tr.label th, tr.label td { border-bottom: 0; }
      tbody.grand th, tbody.grand td { border-top: 2px solid #111; border-bottom: 0; font-weight: bold; font-size: 11px; }
      tbody.grand tr.label + tr td { border-top: 0; }
      .num { text-align: right; white-space: nowrap; }
    `
    doc.head.append(style)
    doc.body.append(snapshot)
    const images = [...doc.images].filter((img) => !img.complete)
    Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          })
      )
    ).then(() => {
      view.addEventListener('afterprint', cleanup, { once: true })
      view.focus()
      view.print()
    })
  }
  frame.srcdoc = '<!doctype html><html><head></head><body></body></html>'
  document.body.append(frame)
  // Also clean up in browsers that do not emit afterprint for an iframe.
  window.setTimeout(cleanup, 300_000)
}
