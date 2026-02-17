import { Text, View } from '@react-pdf/renderer'
import type { InvoiceSettingsProps, OtherAttachment } from './types'
import { getFontBold } from './styles'
import type { Style } from '@react-pdf/types'

interface NotesProps {
  invoiceNotes: string | null
  diagnosticNotes: string | null
  invoiceSettings?: InvoiceSettingsProps
  otherAttachments: OtherAttachment[]
  pdfAttachmentNames: string[]
  fontFamily: string
  styles: Record<string, Style>
}

export function Notes({
  invoiceNotes,
  diagnosticNotes,
  invoiceSettings,
  otherAttachments,
  pdfAttachmentNames,
  fontFamily,
  styles,
}: NotesProps) {
  const fontBold = getFontBold(fontFamily)

  return (
    <>
      {invoiceNotes && (
        <View style={styles.notesSection}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{invoiceNotes}</Text>
        </View>
      )}

      {invoiceSettings?.showBankAccount && invoiceSettings?.bankAccount && (
        <View style={{ ...styles.notesSection, marginTop: 12 }}>
          <Text style={styles.notesLabel}>Til Konto / Bank Account</Text>
          <Text style={{ fontSize: 11, fontFamily: fontBold }}>
            {invoiceSettings.bankAccount}
          </Text>
        </View>
      )}

      {diagnosticNotes && (
        <View style={{ ...styles.notesSection, marginTop: 8 }}>
          <Text style={styles.notesLabel}>Diagnostic Notes</Text>
          <Text style={styles.notesText}>{diagnosticNotes}</Text>
        </View>
      )}

      {(otherAttachments.length > 0 || pdfAttachmentNames.length > 0) && (
        <View style={{ ...styles.notesSection, marginTop: 8 }}>
          <Text style={styles.notesLabel}>Attached Documents</Text>
          {pdfAttachmentNames.map((name, i) => (
            <Text key={`pdf-${i}`} style={styles.notesText}>
              {name} (see appended pages)
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
