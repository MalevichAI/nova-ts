export class SchemaLoadError extends Error {
  constructor(message: string, public source: string, public cause?: unknown) {
    super(message)
    this.name = 'SchemaLoadError'
  }
}

export function isUrl(source: string): boolean {
  try {
    const url = new URL(source)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isJsonString(source: string): boolean {
  if (!source.trim().startsWith('{') && !source.trim().startsWith('[')) {
    return false
  }
  try {
    JSON.parse(source)
    return true
  } catch {
    return false
  }
}

async function readFileContent(filePath: string): Promise<string> {
  // Check if we're in a Node.js environment
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { readFileSync } = await import('node:fs')
      return readFileSync(filePath, 'utf8')
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  throw new Error('File system operations are not available in browser environment')
}

export async function getSchema(source: string | object): Promise<object> {
  if (typeof source === 'object' && source !== null) {
    return source
  }

  if (typeof source !== 'string') {
    throw new SchemaLoadError('Schema source must be a string or object', String(source))
  }

  const trimmed = source.trim()

  try {
    if (isJsonString(trimmed)) {
      return JSON.parse(trimmed)
    }

    if (isUrl(trimmed)) {
      const response = await fetch(trimmed)
      if (!response.ok) {
        throw new SchemaLoadError(
          `Failed to fetch schema: ${response.status} ${response.statusText}`,
          trimmed
        )
      }
      return await response.json()
    }

    const content = await readFileContent(trimmed)
    return JSON.parse(content)
  } catch (error) {
    if (error instanceof SchemaLoadError) {
      throw error
    }
    throw new SchemaLoadError(
      `Failed to load schema: ${error instanceof Error ? error.message : String(error)}`,
      trimmed,
      error
    )
  }
}