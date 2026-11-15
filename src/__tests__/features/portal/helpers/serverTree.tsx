/**
 * A server component's output with every async component inside it already
 * awaited, so Testing Library can render it: React on the client cannot
 * render an async component that sits below the one a test calls.
 *
 *   render(await serverTree(<PortalShell orgId="x">…</PortalShell>))
 *
 * Only async components are called here; everything else (client components
 * with hooks, plain elements) is left for React to render.
 */
import { type ReactElement, type ReactNode, cloneElement, isValidElement } from 'react'

const isAsync = (type: unknown): type is (props: unknown) => Promise<ReactNode> =>
  typeof type === 'function' && type.constructor.name === 'AsyncFunction'

export async function serverTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(serverTree))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<Record<string, unknown>>
  if (isAsync(element.type)) return serverTree(await element.type(element.props))

  const props: Record<string, unknown> = {}
  let changed = false
  for (const [name, value] of Object.entries(element.props)) {
    if (isValidElement(value) || Array.isArray(value)) {
      props[name] = await serverTree(value as ReactNode)
      changed = true
    }
  }
  if (!changed) return element
  const { children, ...rest } = props
  return children === undefined
    ? cloneElement(element, rest)
    : cloneElement(element, rest, ...(Array.isArray(children) ? children : [children]))
}
