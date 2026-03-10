import React from 'react'
import { Text, View } from '@react-pdf/renderer'
import type { InvoiceSettingsProps, OtherAttachment } from './types'
import { getFontBold } from './styles'
import type { Style } from '@react-pdf/types'
import { sanitizeHtml } from '@/lib/sanitize-html'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface NotesProps {
  invoiceNotes: string | null
  diagnosticNotes: string | null
  invoiceSettings?: InvoiceSettingsProps
  otherAttachments: OtherAttachment[]
  pdfAttachmentNames: string[]
  fontFamily: string
  styles: Record<string, Style>
  labels: Record<string, string>
}

// Simple HTML token types
type Token =
  | { type: 'open'; tag: string }
  | { type: 'close'; tag: string }
  | { type: 'selfclose'; tag: string }
  | { type: 'text'; text: string }

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  const re = /<\/([\w]+)>|<([\w]+)\s*\/?>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[1]) tokens.push({ type: 'close', tag: m[1].toLowerCase() })
    else if (m[2]) {
      const tag = m[2].toLowerCase()
      if (tag === 'br') tokens.push({ type: 'selfclose', tag })
      else tokens.push({ type: 'open', tag })
    } else if (m[3]) {
      const text = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
      if (text) tokens.push({ type: 'text', text })
    }
  }
  return tokens
}

interface ASTNode {
  tag: string
  children: (ASTNode | string)[]
}

function buildAST(tokens: Token[]): (ASTNode | string)[] {
  const root: (ASTNode | string)[] = []
  const stack: ASTNode[] = []
  const current = () => (stack.length > 0 ? stack[stack.length - 1].children : root)

  for (const token of tokens) {
    if (token.type === 'text') {
      current().push(token.text)
    } else if (token.type === 'selfclose') {
      current().push({ tag: token.tag, children: [] })
    } else if (token.type === 'open') {
      const node: ASTNode = { tag: token.tag, children: [] }
      current().push(node)
      stack.push(node)
    } else if (token.type === 'close') {
      // Pop until we find the matching open tag
      while (stack.length > 0 && stack[stack.length - 1].tag !== token.tag) {
        stack.pop()
      }
      if (stack.length > 0) stack.pop()
    }
  }
  return root
}

export function HtmlToPdf({
  html,
  baseStyle,
  fontBold,
}: {
  html: string
  baseStyle: Style
  fontBold: string
}) {
  const fontSize = (baseStyle.fontSize as number) || 9
  const color = (baseStyle.color as string) || '#666'
  const lineHeight = (baseStyle.lineHeight as number) || 1.5
  const base: Style = { fontSize, color, lineHeight }

  const clean = sanitizeHtml(html)
  const tokens = tokenize(clean)
  const ast = buildAST(tokens)

  let key = 0
  const nextKey = () => `n${key++}`

  function renderNodes(nodes: (ASTNode | string)[]): React.ReactNode[] {
    return nodes.map((node) => {
      if (typeof node === 'string') return node
      return renderNode(node)
    })
  }

  function renderNode(node: ASTNode): React.ReactNode {
    const k = nextKey()
    const children = renderNodes(node.children)

    switch (node.tag) {
      case 'p':
        return <Text key={k} style={{ ...base, marginBottom: 3 }}>{children}</Text>
      case 'strong':
      case 'b':
        return <Text key={k} style={{ fontFamily: fontBold }}>{children}</Text>
      case 'em':
      case 'i':
        return <Text key={k} style={{ fontStyle: 'italic' }}>{children}</Text>
      case 'u':
        return <Text key={k} style={{ textDecoration: 'underline' }}>{children}</Text>
      case 'h2':
        return <Text key={k} style={{ ...base, fontSize: fontSize + 3, fontFamily: fontBold, marginBottom: 3, marginTop: 4 }}>{children}</Text>
      case 'h3':
        return <Text key={k} style={{ ...base, fontSize: fontSize + 1.5, fontFamily: fontBold, marginBottom: 2, marginTop: 3 }}>{children}</Text>
      case 'ul':
        return <View key={k} style={{ marginLeft: 8, marginBottom: 3 }}>{children}</View>
      case 'ol': {
        let idx = 0
        return (
          <View key={k} style={{ marginLeft: 8, marginBottom: 3 }}>
            {node.children.map((child) => {
              if (typeof child === 'string') return null
              if (child.tag !== 'li') return null
              idx++
              const ck = nextKey()
              return (
                <View key={ck} style={{ flexDirection: 'row', marginBottom: 1 }}>
                  <Text style={{ ...base, width: 12 }}>{idx}.</Text>
                  <Text style={{ ...base, flex: 1 }}>{renderNodes(child.children)}</Text>
                </View>
              )
            })}
          </View>
        )
      }
      case 'li':
        return (
          <View key={k} style={{ flexDirection: 'row', marginBottom: 1 }}>
            <Text style={{ ...base, width: 8 }}>{'\u2022'}</Text>
            <Text style={{ ...base, flex: 1 }}>{children}</Text>
          </View>
        )
      case 'blockquote':
        return (
          <View key={k} style={{ borderLeftWidth: 2, borderLeftColor: color, paddingLeft: 6, marginBottom: 3, opacity: 0.8 }}>
            {children}
          </View>
        )
      case 'br':
        return <Text key={k}>{'\n'}</Text>
      default:
        return <React.Fragment key={k}>{children}</React.Fragment>
    }
  }

  return <View>{renderNodes(ast)}</View>
}

function hasContent(html: string | null): boolean {
  if (!html) return false
  return html.replace(/<[^>]*>/g, '').trim().length > 0
}

// ---------------------------------------------------------------------------
// Individual section components – used by InvoicePDF when layout ordering is
// active so that notes, bank account, and diagnostic notes can be rendered
// independently and in any order.
// ---------------------------------------------------------------------------

export function NotesOnly({
  invoiceNotes,
  otherAttachments,
  pdfAttachmentNames,
  fontFamily,
  styles,
  labels,
}: {
  invoiceNotes: string | null
  otherAttachments: OtherAttachment[]
  pdfAttachmentNames: string[]
  fontFamily: string
  styles: Record<string, Style>
  labels: Record<string, string>
}) {
  const fontBold = getFontBold(fontFamily)
  return (
    <>
      {hasContent(invoiceNotes) && (
        <View wrap={false} style={styles.notesSection}>
          <Text style={styles.notesLabel}>{labels.notes || 'Notes'}</Text>
          <HtmlToPdf html={invoiceNotes!} baseStyle={styles.notesText} fontBold={fontBold} />
        </View>
      )}

      {(otherAttachments.length > 0 || pdfAttachmentNames.length > 0) && (
        <View wrap={false} style={{ ...styles.notesSection, marginTop: 8 }}>
          <Text style={styles.notesLabel}>{labels.attachedDocuments || 'Attached Documents'}</Text>
          {pdfAttachmentNames.map((name, i) => (
            <Text key={`pdf-${i}`} style={styles.notesText}>
              {labels.seeAppendedPages ? fillTemplate(labels.seeAppendedPages, { name }) : `${name} (see appended pages)`}
            </Text>
          ))}
          {otherAttachments.map((att, i) => (
            <Text key={i} style={styles.notesText}>
              {att.fileName}
            </Text>
          ))}
        </View>
      )}
    </>
  )
}

export function BankAccountSection({
  invoiceSettings,
  fontFamily,
  styles,
  labels,
  visibleFields,
  primaryColor = '#d97706',
  dueDate,
}: {
  invoiceSettings?: InvoiceSettingsProps
  fontFamily: string
  styles: Record<string, Style>
  labels: Record<string, string>
  /** When provided by layoutConfig, takes priority over individual toggle props */
  visibleFields?: Set<string> | null
  primaryColor?: string
  dueDate?: string | null
}) {
  const fontBold = getFontBold(fontFamily)

  // layoutConfig fields take priority over individual toggle props
  const showBankAccount = visibleFields
    ? visibleFields.has('bank_account')
    : (invoiceSettings?.showBankAccount ?? false)
  const showOrgNumber = visibleFields
    ? visibleFields.has('org_number')
    : (invoiceSettings?.showOrgNumber ?? false)

  const hasBankAccount = showBankAccount && invoiceSettings?.bankAccount
  const hasOrgNumber = showOrgNumber && invoiceSettings?.orgNumber
  const hasPaymentTerms = !!invoiceSettings?.paymentTerms
  const hasDueDate = !!dueDate

  if (!hasBankAccount && !hasOrgNumber && !hasPaymentTerms && !hasDueDate) return null

  // Convert hex color to rgba-like background (10% opacity)
  const bgColor = `${primaryColor}14`
  const borderColor = primaryColor

  return (
    <View wrap={false} style={{
      marginTop: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: borderColor,
      borderRadius: 4,
      backgroundColor: bgColor,
    }}>
      <Text style={{
        fontSize: 9,
        fontFamily: fontBold,
        color: primaryColor,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
      }}>
        {labels.paymentInformation || 'Payment Information'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {hasBankAccount && (
          <View style={{ minWidth: '40%' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>
              {labels.bankAccount || 'Bank Account'}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: fontBold }}>
              {invoiceSettings!.bankAccount}
            </Text>
          </View>
        )}
        {hasOrgNumber && (
          <View style={{ minWidth: '40%' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>
              {labels.orgNumberLabel || 'Org. Number'}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: fontBold }}>
              {invoiceSettings!.orgNumber}
            </Text>
          </View>
        )}
        {hasPaymentTerms && (
          <View style={{ minWidth: '40%' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>
              {labels.paymentTermsLabel || 'Payment Terms'}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: fontBold }}>
              {invoiceSettings!.paymentTerms}
            </Text>
          </View>
        )}
        {hasDueDate && (
          <View style={{ minWidth: '40%' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>
              {labels.dueDateLabel || 'Due Date'}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: fontBold }}>
              {dueDate}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

export function DiagnosticNotesSection({
  diagnosticNotes,
  fontFamily,
  styles,
  labels,
}: {
  diagnosticNotes: string | null
  fontFamily: string
  styles: Record<string, Style>
  labels: Record<string, string>
}) {
  const fontBold = getFontBold(fontFamily)
  if (!hasContent(diagnosticNotes)) return null
  return (
    <View wrap={false} style={{ ...styles.notesSection, marginTop: 8 }}>
      <Text style={styles.notesLabel}>{labels.diagnosticNotes || 'Diagnostic Notes'}</Text>
      <HtmlToPdf html={diagnosticNotes!} baseStyle={styles.notesText} fontBold={fontBold} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Composite Notes component – kept for backward compatibility
// ---------------------------------------------------------------------------

export function Notes({
  invoiceNotes,
  diagnosticNotes,
  invoiceSettings,
  otherAttachments,
  pdfAttachmentNames,
  fontFamily,
  styles,
  labels,
}: NotesProps) {
  return (
    <>
      <NotesOnly
        invoiceNotes={invoiceNotes}
        otherAttachments={otherAttachments}
        pdfAttachmentNames={pdfAttachmentNames}
        fontFamily={fontFamily}
        styles={styles}
        labels={labels}
      />
      <BankAccountSection
        invoiceSettings={invoiceSettings}
        fontFamily={fontFamily}
        styles={styles}
        labels={labels}
      />
      <DiagnosticNotesSection
        diagnosticNotes={diagnosticNotes}
        fontFamily={fontFamily}
        styles={styles}
        labels={labels}
      />
    </>
  )
}
