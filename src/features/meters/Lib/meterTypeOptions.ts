/**
 * A meter's options besides its name and unit, and the one place they map to
 * the meter's columns. The settings dialog draws one switch per key of
 * `METER_TYPE_OPTION_KEYS`; the save action writes what
 * `meterTypeOptionColumns` returns. Adding an option is a key in the schema
 * (meterSchema.ts), a column, a line in each function below and its words in
 * `settings.meters.options`.
 *
 * Pure, so the dialog and the server share it.
 */
import type { MeterTypeOptions } from '../Schema/meterSchema'

/** The options in the order the dialog shows them. */
export const METER_TYPE_OPTION_KEYS = [
  'required',
] as const satisfies readonly (keyof MeterTypeOptions)[]

/** What a new meter starts with: nothing asked of anyone. */
export const DEFAULT_METER_TYPE_OPTIONS: MeterTypeOptions = { required: false }

/** The columns the options are stored in. */
export function meterTypeOptionColumns(options: MeterTypeOptions): { required: boolean } {
  return { required: options.required }
}

/** A stored meter's options, for the dialog to start from. */
export function meterTypeOptionsOf(row: { required?: boolean | null }): MeterTypeOptions {
  return { required: row.required === true }
}
