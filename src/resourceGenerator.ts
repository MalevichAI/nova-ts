import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { generate as generateNodes } from './generator.js'
import { getSchema } from './schemaLoader.js'
import { cleanupSchema, isOgmLink } from './ogmHelpers.js'

interface ResourceMeta {
  name?: string
  type: 'proxy' | 'create' | 'update' | 'link'
  info?: {
    pivot_type?: string
    pivot_key?: string
    mounts?: Record<string, {
      pivot_type?: string
      pivot_key?: string
      is_resource?: boolean
      is_array?: boolean
      relation_model?: string
      info?: { name?: string }
    }>
  }
}

interface ResourceSchema {
  name: string
  schema: any
  meta: ResourceMeta
}

// Convert JSON schema property to TypeScript type string (same as in generator.ts)
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

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

function isOgmNode(schema: any): boolean {
  return !!(schema?._malevich_ogm_node || schema?._node_schema?._malevich_ogm_node)
}

// Generate TypeScript interface from link schema
function generateLinkInterface(name: string, schema: any, allSchemas: Record<string, any>): string {
  const sanitized = sanitizeName(name)
  
  let interfaceBody = ''
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])
  
  // Skip inherited properties from Link base interface
  const skipProps = new Set(['uid', 'created_at', 'updated_at'])
  
  for (const [propName, propSchema] of Object.entries(properties)) {
    if (skipProps.has(propName)) continue
    
    const propType = jsonSchemaToTsType(propSchema, allSchemas)
    const isOptional = !required.has(propName)
    const optionalMark = isOptional ? '?' : ''
    
    interfaceBody += `  ${propName}${optionalMark}: ${propType}\n`
  }
  
  // Add index signature only if explicitly set and interface has other fields
  if (schema.additionalProperties === true && interfaceBody.length > 0) {
    interfaceBody += '  [k: string]: any\n'
  }
  
  // If no properties after filtering, just create empty extending interface
  if (interfaceBody.length === 0) {
    return `export interface ${sanitized} extends Link {}\n\n`
  }
  
  return `export interface ${sanitized} extends Link {\n${interfaceBody}}\n\n`
}

export async function generateResources(source: string | object, outDir: string): Promise<void> {
  const data = await getSchema(source) as any

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  const nodesTs = await generateNodes(data)
  writeFileSync(join(outDir, 'nodes.ts'), nodesTs, 'utf8')

  const resourceSchemas = extractResourceSchemas(data)
  const linkSchemas = extractLinkSchemas(data)
  const proxyResources = resourceSchemas.filter(r => r.meta.type === 'proxy')

  if (proxyResources.length === 0) {
    console.warn('No proxy resources found in schema')
    return
  }

  const { abstractTypes, referencedTypes, usedLinkTypes } = generateAbstractResources(proxyResources)
  const linkTypes = await generateLinkTypes(linkSchemas, usedLinkTypes, data.components?.schemas || {})

  const imports = [
    'import type {',
    '  ResourceEdge,',
    '  Base,',
    '  Create,',
    '  Update,',
    '  AbstractResource,',
    '  MaterializedResource,',
    '  CreateResource,',
    '  UpdateResource,',
    '  LinkResource,',
    '  Mount,',
    '  Link',
    "} from '@malevichai/nova-ts'",
    `import type { ${Array.from(referencedTypes).join(', ')} } from './nodes'`,
    ''
  ].join('\n')

  const output = [
    imports,
    linkTypes,
    abstractTypes.join('\n\n')
  ].join('\n\n')

  writeFileSync(join(outDir, 'resources.ts'), output, 'utf8')
  console.log(`✅ Generated resources to ${join(outDir, 'resources.ts')}`)
}

function generateAbstractResources(resources: ResourceSchema[]): {
  abstractTypes: string[]
  referencedTypes: Set<string>
  usedLinkTypes: Set<string>
} {
  const abstractTypes: string[] = []
  const referencedTypes = new Set<string>()
  const usedLinkTypes = new Set<string>()

  for (const resource of resources) {
    const { pivotKey, pivotType, mounts } = extractResourceMetadata(resource)
    
    referencedTypes.add(pivotType)

    const mountDefs: string[] = []
    for (const [mountName, mountInfo] of Object.entries(mounts)) {
      const mountType = mountInfo.pivot_type || 'any'
      const linkType = mountInfo.relation_model || 'Link'
      const isArray = mountInfo.is_array ? 'true' : 'false'
      
      if (mountType !== 'any') {
        referencedTypes.add(mountType)
      }
      
      if (mountInfo.relation_model) {
        usedLinkTypes.add(mountInfo.relation_model)
      }

      mountDefs.push(`    ${mountName}: Mount<${mountType}, ${linkType}, ${isArray}>`)
    }

    const mountsBlock = mountDefs.length > 0
      ? `{\n${mountDefs.join(',\n')}\n  }`
      : '{}'

    abstractTypes.push(
      `export interface ${resource.name} extends AbstractResource<\n  '${pivotKey}',\n  ${pivotType},\n  ${mountsBlock}\n> {}`
    )
  }

  return { abstractTypes, referencedTypes, usedLinkTypes }
}

function extractResourceMetadata(resource: ResourceSchema): {
  pivotKey: string
  pivotType: string
  mounts: Record<string, any>
} {
  const info = resource.meta.info || {}
  
  const pivotType = info.pivot_type || inferPivotType(resource.name)
  const pivotKey = info.pivot_key || inferPivotKey(resource.schema, pivotType) || 'uid'
  const mounts = info.mounts || {}

  return { pivotKey, pivotType, mounts }
}

function inferPivotType(resourceName: string): string {
  const mappings: Record<string, string> = {
    'BasicCaseResource': 'Case',
    'MessageResource': 'ChatMessage',
    'UserSystemLayoutResource': 'User',
    'TicketDetailResource': 'Ticket',
    'NotRestrictedTicketDetailResource': 'Ticket'
  }
  
  if (mappings[resourceName]) return mappings[resourceName]
  if (resourceName.endsWith('Resource')) return resourceName.slice(0, -8)
  return resourceName
}

function inferPivotKey(schema: any, nodeType: string): string | null {
  if (!schema.properties) return null
  
  const nodeTypeLower = nodeType.toLowerCase()
  
  for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
    if (typeof fieldSchema !== 'object' || !fieldSchema) continue
    
      const field = fieldSchema as any
    if (field.$ref?.includes('ResourceEdge_')) continue
    
    const fieldLower = fieldName.toLowerCase()
    if (fieldLower === nodeTypeLower || 
        fieldLower.replace(/_/g, '') === nodeTypeLower) {
      return fieldName
    }
  }
  
  return null
}

async function generateLinkTypes(linkSchemas: any[], usedLinkTypes: Set<string>, allSchemas: Record<string, any>): Promise<string> {
  const generatedLinks: string[] = []
  
  for (const { name, schema } of linkSchemas) {
    const interfaceCode = generateLinkInterface(name, schema, allSchemas)
    if (interfaceCode.trim()) {
      generatedLinks.push(interfaceCode.trim())
    }
  }
  
  const additionalLinks = Array.from(usedLinkTypes)
    .filter(t => t !== 'Link' && !linkSchemas.some(l => l.name === t))
    .map(t => `export interface ${t} extends Link {}`)
  
  return [...generatedLinks, ...additionalLinks].join('\n\n')
}

function extractResourceSchemas(data: any): ResourceSchema[] {
  const schemas: ResourceSchema[] = []
  
  if (data.components?.schemas) {
    for (const [name, schema] of Object.entries(data.components.schemas)) {
      const s = schema as any
      if (s._resource) {
        // Sanitize name to be valid TypeScript identifier
        const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '')
        schemas.push({
          name: sanitizedName,
          schema: s,
          meta: s._resource
        })
      }
    }
  }
  
  return schemas
}

function extractLinkSchemas(data: any): Array<{ name: string; schema: any }> {
  const schemas: Array<{ name: string; schema: any }> = []
  
  if (data.components?.schemas) {
    for (const [name, schema] of Object.entries(data.components.schemas)) {
      if (isOgmLink(schema)) {
        schemas.push({ name, schema })
      }
    }
  }
  
  return schemas
} 