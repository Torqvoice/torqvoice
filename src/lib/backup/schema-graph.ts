/**
 * What a restore needs to know about the schema, read from the Prisma
 * schema text: which models carry an organisation, which scalar columns are
 * foreign keys and to what, and how a model without an organisation column
 * reaches one through its parents. `scripts/generate-tenancy-schema.ts`
 * writes the result into tenancy-schema.ts, and a test keeps that file in
 * step with the schema.
 */

export interface ForeignKey {
  /** The model the column points at. */
  target: string
  /** A row cannot exist without it. */
  required: boolean
  /** The relation field the column belongs to, for nested filters. */
  relation: string
}

export interface ModelGraph {
  /** The model has an organizationId column of its own. */
  organizationId: boolean
  foreignKeys: Record<string, ForeignKey>
  /**
   * Relation paths from this model to a model with an organisation column,
   * for a model without one: `[['serviceRecord']]` says a service part's
   * workshop is its service record's. Empty for a model with its own column.
   */
  ownerPaths: string[][]
}

export type SchemaGraph = Record<string, ModelGraph>

const MAX_OWNER_DEPTH = 5

/**
 * Each `model X { ... }` block, line by line. A block ends at the first line
 * that is a lone `}`, so a brace inside a comment or default does not cut it.
 */
function modelBlocks(schema: string): { name: string; lines: string[] }[] {
  const blocks: { name: string; lines: string[] }[] = []
  let current: { name: string; lines: string[] } | null = null
  for (const line of schema.split('\n')) {
    const start = /^model\s+(\w+)\s*\{/.exec(line.trim())
    if (start) {
      current = { name: start[1], lines: [] }
      continue
    }
    if (!current) continue
    if (line.trim() === '}') {
      blocks.push(current)
      current = null
      continue
    }
    current.lines.push(line)
  }
  return blocks
}

/** Model name, no `?` or `[]`. */
function bareType(type: string): string {
  return type.replace(/[?[\]]/g, '')
}

export function parseSchemaGraph(schema: string): SchemaGraph {
  const graph: SchemaGraph = {}
  const relations: Record<string, { field: string; target: string }[]> = {}
  for (const block of modelBlocks(schema)) {
    const name = block.name
    const foreignKeys: Record<string, ForeignKey> = {}
    let organizationId = false
    relations[name] = []
    for (const raw of block.lines) {
      const line = raw.trim()
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue
      const [field, type] = line.split(/\s+/)
      if (!field || !type) continue
      if (field === 'organizationId' && (type === 'String' || type === 'String?'))
        organizationId = true
      const relation = /@relation\(([^)]*)\)/.exec(line)
      const fields = relation && /fields:\s*\[([^\]]*)\]/.exec(relation[1])
      if (!fields) continue
      const target = bareType(type)
      const required = !type.endsWith('?')
      for (const column of fields[1].split(',')) {
        const key = column.trim()
        if (key) foreignKeys[key] = { target, required, relation: field }
      }
      relations[name].push({ field, target })
    }
    graph[name] = { organizationId, foreignKeys, ownerPaths: [] }
  }

  const pathsOf = (name: string, seen: Set<string>, depth: number): string[][] => {
    const model = graph[name]
    if (!model) return []
    if (model.organizationId) return [[]]
    if (depth >= MAX_OWNER_DEPTH) return []
    const out: string[][] = []
    for (const { field, target } of relations[name] ?? []) {
      if (seen.has(target)) continue
      for (const rest of pathsOf(target, new Set([...seen, target]), depth + 1)) {
        out.push([field, ...rest])
      }
    }
    return out
  }
  for (const name of Object.keys(graph)) {
    if (!graph[name].organizationId) graph[name].ownerPaths = pathsOf(name, new Set([name]), 0)
  }
  return graph
}
