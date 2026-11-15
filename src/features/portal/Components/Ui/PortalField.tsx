/**
 * Form fields in the theme's shape.
 *
 *   <PortalField label="Your email address" htmlFor="email" hint="…" error={problem}>
 *     <PortalInput id="email" type="email" size="lg" />
 *   </PortalField>
 *
 * `PortalField` draws the label above its control, an optional hint below and
 * an error (announced, `role="alert"`) when there is one. Give the control the
 * id named in `htmlFor`.
 *
 * `PortalInput`, `PortalTextarea` and `PortalSelect` are the native elements
 * with the theme's border, corner and focus ring, and take every native
 * attribute. `size="lg"` (56 px) is for the one field of a short form;
 * otherwise 48 px. Text is 16 px so a phone does not zoom into the field.
 * `invalid` marks the control for the error colour.
 *
 * `PortalNotice` is a boxed message: `tone="danger"` for something that went
 * wrong (pass `role="alert"`), the default for something to know.
 */

export function PortalField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor: string
  hint?: React.ReactNode
  error?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className ? `p-field ${className}` : 'p-field'}>
      <label htmlFor={htmlFor} className="p-field__label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="p-field__hint">{hint}</p>}
      {error && (
        <p role="alert" className="p-field__error">
          {error}
        </p>
      )}
    </div>
  )
}

type ControlLook = { size?: 'md' | 'lg'; invalid?: boolean; className?: string }

const controlClass = ({ size, className }: ControlLook) =>
  ['p-input', size === 'lg' && 'p-input--lg', className].filter(Boolean).join(' ')

export function PortalInput({
  size,
  invalid,
  className,
  ...rest
}: ControlLook & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'className'>) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={controlClass({ size, className })}
    />
  )
}

export function PortalTextarea({
  invalid,
  className,
  ...rest
}: Omit<ControlLook, 'size'> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={controlClass({ className })}
    />
  )
}

export function PortalSelect({
  size,
  invalid,
  className,
  children,
  ...rest
}: ControlLook & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'className'>) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={controlClass({ size, className })}
    >
      {children}
    </select>
  )
}

export function PortalNotice({
  tone = 'info',
  className,
  children,
  ...rest
}: {
  tone?: 'info' | 'danger'
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  const classes = ['p-notice', tone === 'danger' && 'p-notice--danger', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div {...rest} className={classes}>
      {children}
    </div>
  )
}
