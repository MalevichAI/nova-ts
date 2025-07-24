import { readFileSync } from 'node:fs'
import { compile } from 'json-schema-to-typescript'

function isUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://')
}

async function readSource(input: string): Promise<string> {
  if (isUrl(input)) {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`Failed to fetch schema from ${input}: ${res.status} ${res.statusText}`)
    return await res.text()
  }
  return readFileSync(input, 'utf8')
}

interface MalevichOgmNode {
  label: string
  name: string
  relations: Array<{
    cardinality: string
    incoming: boolean
    required: boolean
    target: string
    type: string
  }>
}

interface SchemaWithOgm {
  _malevich_ogm_node?: MalevichOgmNode
  _node_schema?: {
    _malevich_ogm_node?: MalevichOgmNode
    [key: string]: any
  }
  [key: string]: any
}

export async function generate(sourcePath: string): Promise<string> {
  const source = await readSource(sourcePath)
  const data = JSON.parse(source)
  
  const schemas = extractSchemas(data)
  const ogmNodes = schemas.filter(({ schema }) => 
    schema._malevich_ogm_node || schema._node_schema?._malevich_ogm_node
  )
  
  if (ogmNodes.length === 0) {
    throw new Error('No schemas with _malevich_ogm_node found')
  }
  
  const nodeTypes = await Promise.all(
    ogmNodes.map(async ({ name, schema }) => {
      let cleanSchema = { ...schema }
      
      // If _node_schema exists, use it as the base schema
      if (schema._node_schema) {
        cleanSchema = { ...schema._node_schema }
      }
      
      // Remove all OGM and metadata fields
      delete cleanSchema._malevich_ogm_node
      delete cleanSchema._malevich_ogm_link
      delete cleanSchema._node_schema
      delete cleanSchema._node_name
      delete cleanSchema.$defs
      
      // Remove all $ref to avoid external references
      cleanSchema = removeReferences(cleanSchema)
      
      return await compile(cleanSchema, name, {
        bannerComment: '',
        style: {
          singleQuote: true,
          semi: false
        }
      })
    })
  )
  
  // Post-process to remove duplicate type definitions
  const deduped = deduplicateTypes(nodeTypes.join('\n\n'))
  const inlined = inlineAliasTypes(deduped)
  // Make uid required and always string
  let finalOutput = inlined.replace(/uid\?\s*:\s*string/g, 'uid: string')
  // Fix invalid type alias syntax where enum values are used as type names
  finalOutput = fixInvalidTypeAliases(finalOutput)
  return finalOutput
}

function deduplicateTypes(typescript: string): string {
  const lines = typescript.split('\n')
  const seenTypes = new Map<string, string>()
  const seenInterfaces = new Set<string>()
  const commonTypeDefinitions: string[] = []
  const nonCommonLines: string[] = []
  
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    
    // Handle type definitions
    const typeMatch = line.match(/^export type (\w+) = (.+)$/)
    if (typeMatch) {
      const [, typeName, typeDefinition] = typeMatch
      const typeKey = `${typeName}=${typeDefinition}`
      
      if (seenTypes.has(typeName)) {
        // Skip if we've already seen this exact type definition
        if (seenTypes.get(typeName) === typeDefinition) {
          i++
          continue
        }
      } else {
        seenTypes.set(typeName, typeDefinition)
        
        // Check if this is a common type that appears multiple times
        const remainingContent = lines.slice(i + 1).join('\n')
        const typePattern = new RegExp(`^export type ${typeName} = ${typeDefinition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm')
        const matches = remainingContent.match(typePattern)
        
        if (matches && matches.length > 0) {
          // This type appears again later, add to common types
          commonTypeDefinitions.push(line)
        } else {
          // This type is unique, add to non-common lines
          nonCommonLines.push(line)
        }
      }
      i++
      continue
    }
    
    // Handle interface definitions
    if (line.startsWith('export interface ')) {
      const interfaceMatch = line.match(/^export interface (\w+)/)
      if (interfaceMatch) {
        const [, interfaceName] = interfaceMatch
        if (seenInterfaces.has(interfaceName)) {
          // Skip this entire interface
          i++
          while (i < lines.length && !lines[i].match(/^export (interface|type)/)) {
            i++
          }
          continue
        }
        seenInterfaces.add(interfaceName)
      }
    }
    
    // Add non-type lines and non-duplicate content
    nonCommonLines.push(line)
    i++
  }
  
  // Combine: common types first, then everything else
  const result: string[] = []
  if (commonTypeDefinitions.length > 0) {
    result.push(...commonTypeDefinitions, '')
  }
  result.push(...nonCommonLines)
  
  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}

function fixInvalidTypeAliases(ts: string): string {
  // Fix invalid type alias syntax like: export type 'tunneled' | 'agent' = ...
  // This happens when json-schema-to-typescript tries to create a type alias from enum values
  const lines = ts.split('\n')
  const fixedLines: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Match invalid type alias patterns
    const invalidAliasMatch = line.match(/^export type '([^']+)'\s*\|\s*'([^']+)'\s*=\s*$/)
    if (invalidAliasMatch) {
      // Skip this invalid line and the following union type lines
      let j = i + 1
      const unionLines = []
      while (j < lines.length && (lines[j].trim().startsWith('|') || lines[j].trim() === '')) {
        if (lines[j].trim().startsWith('|')) {
          unionLines.push(lines[j].trim())
        }
        j++
      }
      
      // Skip the invalid type alias entirely - these are usually duplicated properly elsewhere
      i = j - 1
      continue
    }
    
    fixedLines.push(line)
  }
  
  return fixedLines.join('\n')
}

function inlineAliasTypes(ts: string): string {
  const lines = ts.split('\n')
  const aliasRegex = /^export type (\w+) = (.*)$/
  const aliasMap = new Map<string, string>()
  const otherLines: string[] = []

  for (const line of lines) {
    const match = line.match(aliasRegex)
    if (match) {
      const [, name, definition] = match
      aliasMap.set(name, definition.trim())
      continue // skip alias line
    }
    otherLines.push(line)
  }

  let content = otherLines.join('\n')
  
  // Replace alias usages with inline definitions line by line to avoid altering interface names
  const contentLines = content.split('\n')
  for (let idx = 0; idx < contentLines.length; idx++) {
    const line = contentLines[idx]

    // Skip orphan JSDoc blocks (comment blocks not attached to code)
    if (line.trim().startsWith('/**')) {
      let j = idx
      while (j < contentLines.length && !contentLines[j].trim().endsWith('*/')) {
        j++
      }
      // include closing line
      if (j < contentLines.length) j++

      // Peek next non-empty line
      let k = j
      while (k < contentLines.length && contentLines[k].trim() === '') {
        k++
      }
      const nextLine = contentLines[k] || ''
      const isAttached = nextLine.trim().startsWith('export') || /\w+\s*[:(]/.test(nextLine)
      if (!isAttached) {
        // Remove lines from idx to j-1
        contentLines.splice(idx, j - idx)
        idx--
        continue
      }
    }

    if (line.startsWith('export interface ')) {
      continue // do not replace inside interface declaration line
    }
    let updated = line
    for (const [name, def] of aliasMap) {
      const pattern = new RegExp(`\\b${name}\\b`, 'g')
      updated = updated.replace(pattern, def)
    }
    contentLines[idx] = updated
  }
  content = contentLines.join('\n')

  // Collapse multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n')
  return content.trim() + '\n'
}

function removeReferences(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeReferences)
  }
  
  if (obj && typeof obj === 'object') {
    if (obj.$ref) {
      // Replace $ref with a generic type
      return { type: 'string', description: 'Reference to external schema' }
    }
    
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key !== '$ref') {
        result[key] = removeReferences(value)
      }
    }
    return result
  }
  
  return obj
}

function extractSchemas(data: any): Array<{ name: string; schema: SchemaWithOgm }> {
  const schemas: Array<{ name: string; schema: SchemaWithOgm }> = []
  const seen = new Set<string>()
  
  // Handle OpenAPI v3 format
  if (data.components?.schemas) {
    for (const [name, schema] of Object.entries(data.components.schemas)) {
      if (!seen.has(name)) {
        schemas.push({ name, schema: schema as SchemaWithOgm })
        seen.add(name)
      }
    }
  }
  
  // Handle JSON Schema definitions
  if (data.definitions) {
    for (const [name, schema] of Object.entries(data.definitions)) {
      if (!seen.has(name)) {
        schemas.push({ name, schema: schema as SchemaWithOgm })
        seen.add(name)
      }
    }
  }
  
  // Handle flattened schema where root object contains schema definitions
  if (typeof data === 'object' && !data.openapi && !data.components) {
    for (const [name, schema] of Object.entries(data)) {
      if (typeof schema === 'object' && schema !== null && !seen.has(name)) {
        schemas.push({ name, schema: schema as SchemaWithOgm })
        seen.add(name)
      }
    }
  }
  
  findSchemasRecursive(data, schemas, seen)
  
  return schemas
}

function findSchemasRecursive(obj: any, schemas: Array<{ name: string; schema: SchemaWithOgm }>, seen: Set<string>, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return
  
  // Check for _malevich_ogm_node directly or in _node_schema
  if ((obj._malevich_ogm_node || obj._node_schema?._malevich_ogm_node) && obj.type === 'object') {
    const name = obj.title || obj._node_name || obj._malevich_ogm_node?.name || obj._node_schema?._malevich_ogm_node?.name || 'UnknownNode'
    if (!seen.has(name)) {
      schemas.push({ name, schema: obj })
      seen.add(name)
    }
  }
  
  for (const [key, value] of Object.entries(obj)) {
    if (key !== 'components' && key !== 'definitions') {
      findSchemasRecursive(value, schemas, seen, path ? `${path}.${key}` : key)
    }
  }
} 