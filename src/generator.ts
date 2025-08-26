import { compile } from 'json-schema-to-typescript'
import { getSchema } from './schemaLoader.js'

interface SchemaWithOgm {
  name: string
  schema: any
  isNode: boolean
  isLink: boolean
  metadata?: {
    node?: any
    link?: any
  }
}

function isOgmNode(schema: any): boolean {
  return !!(schema?._malevich_ogm_node || schema?._node_schema?._malevich_ogm_node)
}

function isOgmLink(schema: any): boolean {
  return !!(schema?._malevich_ogm_link || schema?._node_schema?._malevich_ogm_link)
}

function getOgmMetadata(schema: any) {
  const node = schema._malevich_ogm_node || schema._node_schema?._malevich_ogm_node
  const link = schema._malevich_ogm_link || schema._node_schema?._malevich_ogm_link
  return { node, link }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

// Convert JSON schema property to TypeScript type string
function jsonSchemaToTsType(prop: any, allSchemas: Record<string, any>): string {
  if (!prop) return 'any'
  
  // Handle $ref
  if (prop.$ref) {
    const refName = prop.$ref.replace('#/components/schemas/', '')
    const sanitized = sanitizeName(refName)
    
    // Skip ResourceEdge types - use generic instead
    if (sanitized.startsWith('ResourceEdge_')) {
      return 'ResourceEdge<any, any>'
    }
    
    // Check if it's an OGM type that we'll generate
    const referencedSchema = allSchemas[refName]
    if (referencedSchema && (isOgmNode(referencedSchema) || isOgmLink(referencedSchema))) {
      return sanitized
    }
    
    // For non-OGM schemas, inline if simple
    if (referencedSchema) {
      return jsonSchemaToTsType(referencedSchema, allSchemas)
    }
    
    return 'any'
  }
  
  // Handle anyOf (union types)
  if (prop.anyOf) {
    const types = prop.anyOf
      .map((item: any) => jsonSchemaToTsType(item, allSchemas))
      .filter((type: string) => type !== 'null')
    
    const hasNull = prop.anyOf.some((item: any) => item.type === 'null')
    const uniqueTypes = [...new Set(types)]
    
    if (uniqueTypes.length === 0) return 'any'
    if (uniqueTypes.length === 1) {
      const singleType = uniqueTypes[0] as string
      return hasNull ? `${singleType} | null` : singleType
    }
    
    const unionType = uniqueTypes.join(' | ')
    return hasNull ? `${unionType} | null` : unionType
  }
  
  // Handle allOf
  if (prop.allOf) {
    // For now, just use the first schema
    return jsonSchemaToTsType(prop.allOf[0], allSchemas)
  }
  
  // Handle oneOf
  if (prop.oneOf) {
    const types = prop.oneOf.map((item: any) => jsonSchemaToTsType(item, allSchemas))
    return [...new Set(types)].join(' | ')
  }
  
  // Handle arrays
  if (prop.type === 'array') {
    if (prop.items) {
      const itemType = jsonSchemaToTsType(prop.items, allSchemas)
      return `${itemType}[]`
    }
    return 'any[]'
  }
  
  // Handle objects
  if (prop.type === 'object') {
    return 'any' // For now, inline object types as any
  }
  
  // Handle enums
  if (prop.enum) {
    const enumValues = prop.enum.map((val: any) => typeof val === 'string' ? `"${val}"` : val)
    return enumValues.join(' | ')
  }
  
  // Handle basic types
  switch (prop.type) {
    case 'string': return 'string'
    case 'number': return 'number'
    case 'integer': return 'number'
    case 'boolean': return 'boolean'
    case 'null': return 'null'
    default: return 'any'
  }
}

// Generate TypeScript interface from schema
function generateInterface(schemaWithOgm: SchemaWithOgm, allSchemas: Record<string, any>): string {
  const { name, schema, isNode, isLink } = schemaWithOgm
  const sanitized = sanitizeName(name)
  
  // Skip base types
  if (sanitized === 'Base' || sanitized === 'Link') {
    return ''
  }
  
  const baseInterface = isNode ? 'Base' : isLink ? 'Link' : ''
  const extendsClause = baseInterface ? ` extends ${baseInterface}` : ''
  
  let interfaceBody = ''
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])
  
  // Skip inherited properties for Base/Link extensions
  const skipProps = baseInterface ? new Set(['uid', 'created_at', 'updated_at']) : new Set()
  
  for (const [propName, propSchema] of Object.entries(properties)) {
    if (skipProps.has(propName)) continue
    
    const propType = jsonSchemaToTsType(propSchema, allSchemas)
    const isOptional = !required.has(propName)
    const optionalMark = isOptional ? '?' : ''
    
    interfaceBody += `  ${propName}${optionalMark}: ${propType}\n`
  }
  
  // Add index signature only if explicitly set
  if (schema.additionalProperties === true && interfaceBody.length > 0) {
    interfaceBody += '  [k: string]: any\n'
  }
  
  // Don't generate empty interfaces unless they extend something
  if (interfaceBody.length === 0 && !baseInterface) {
    return ''
  }
  
  return `export interface ${sanitized}${extendsClause} {\n${interfaceBody}}\n\n`
}

async function extractOgmSchemas(data: any): Promise<SchemaWithOgm[]> {
  const schemas: SchemaWithOgm[] = []
  
  if (data.components?.schemas) {
    for (const [name, schema] of Object.entries(data.components.schemas)) {
      const s = schema as any
      const isNode = isOgmNode(s)
      // Only extract nodes, not links (links are handled in resources.ts)
      
      if (isNode) {
        schemas.push({
          name: sanitizeName(name),
          schema: s,
          isNode: true,
          isLink: false,
          metadata: getOgmMetadata(s)
        })
      }
    }
  }
  
  return schemas
}

function generateBaseInterfaces(): string {
  return `export interface Base {
  uid: string
  created_at?: string | null
  updated_at?: string | null
  type_: string
}

export interface Link extends Base {}

export type ResourceEdge<T, U> = {
  $resource: T
  $edges: U[]
}

`
}

export async function generate(source: string | object): Promise<string> {
  try {
    const data = await getSchema(source) as any
    const ogmSchemas = await extractOgmSchemas(data)
    
    if (ogmSchemas.length === 0) {
      throw new Error('No schemas with _malevich_ogm_node or _malevich_ogm_link found')
    }
    
    const allSchemas = data.components?.schemas || {}
    
    let output = generateBaseInterfaces()
    
    // Generate OGM interfaces
    for (const schemaWithOgm of ogmSchemas) {
      const interfaceCode = generateInterface(schemaWithOgm, allSchemas)
      if (interfaceCode) {
        output += interfaceCode
      }
    }
    
    return output
  } catch (error) {
    console.error('Error in generate:', error)
    throw error
  }
} 