import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { generate as generateNodes } from './generator.js'
import { compile } from 'json-schema-to-typescript'

interface ResourceMeta {
  name?: string
  type: 'proxy' | 'create' | 'update' | 'link'
  info?: any
}

interface SchemaWithResource {
  _resource?: ResourceMeta
  [k: string]: any
}

export async function generateResources(schemaPath: string, outDir: string): Promise<void> {
  const source = readFileSync(schemaPath, 'utf8')
  const data = JSON.parse(source)

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  // 1. Generate nodes.ts file using existing generator
  const nodesTs = await generateNodes(schemaPath)
  writeFileSync(join(outDir, 'nodes.ts'), nodesTs, 'utf8')

  // 2. Generate resources.ts file using new interface structure
  const resourceSchemas = extractResourceSchemas(data)
  const proxySchemas = resourceSchemas.filter(s => s.schema._resource?.type === 'proxy')

  // Track referenced node types for imports
  const referencedTypes = new Set<string>()
  const usedLinkTypes = new Set<string>()

  // Generate AbstractResource interface definitions
  const abstractResourceTypes: string[] = []

  for (const { name, schema } of proxySchemas) {
    const meta = schema._resource as any || {}
    const info = meta.info || {}

    const pivotType: string = info.pivot_type || mapResourceToNodeType(name, schema)
    const pivotKey: string = info.pivot_key || findPivotField(schema, pivotType) || 'uid'
    referencedTypes.add(pivotType)

    const mounts = info.mounts ? Object.entries(info.mounts) : []
    
    // Generate mount definitions
    const mountDefinitions = mounts.map(([mountKey, mountInfo]: [string, any]) => {
      let resourceType = 'any'
      const linkType = mountInfo?.relation_model ?? 'Link'
      usedLinkTypes.add(linkType)
      
      if (mountInfo && mountInfo.pivot_type) {
        if (mountInfo.is_resource) {
          // Reference to another resource
          resourceType = mountInfo.info?.name ?? `${mountInfo.pivot_type}Resource`
        } else {
          // Reference to a node type
          resourceType = mountInfo.pivot_type
          referencedTypes.add(resourceType)
        }
      }
      
      const isArray = mountInfo?.is_array ?? false
      
      return `    ${mountKey}: Mount<${resourceType}, ${linkType}, ${isArray}>`
    })

    const mountsBlock = mountDefinitions.length > 0 
      ? `{\n${mountDefinitions.join(',\n')}\n  }`
      : '{}'

    const abstractTypeDef = `export interface ${name} extends AbstractResource<\n  '${pivotKey}',\n  ${pivotType},\n  ${mountsBlock}\n> {}`
    abstractResourceTypes.push(abstractTypeDef)
  }

  // Generate materialized resource types
  const materializedResourceTypes = proxySchemas.map(({ name }) => 
    `export type Materialized${name} = MaterializedResource<${name}>`
  )

  // Generate create/update/link resource types
  const createResourceTypes = proxySchemas.map(({ name }) => 
    `export type Create${name} = CreateResource<${name}>`
  )

  const updateResourceTypes = proxySchemas.map(({ name }) => 
    `export type Update${name} = UpdateResource<${name}>`
  )

  const linkResourceTypes = proxySchemas.map(({ name }) => 
    `export type Link${name} = LinkResource<${name}>`
  )

  // Import base types from @malevichai/nova-ts package
  const baseImports = `import type {
  ResourceEdge,
  Base,
  Create,
  Update,
  AbstractResource,
  MaterializedResource,
  CreateResource,
  UpdateResource,
  LinkResource,
  Mount,
  Link
} from '@malevichai/nova-ts'`

  // Import node types from nodes.ts
  const nodeTypeNames = Array.from(referencedTypes).filter(t => 
    t !== 'Link' && 
    !t.startsWith('ResourceEdge_') && 
    !t.endsWith('Resource') &&
    t !== 'ClientCompanyInfo'
  )
  
  const nodesImport = nodeTypeNames.length > 0
    ? `import type { ${nodeTypeNames.sort().join(', ')} } from './nodes'`
    : ''

  // Generate link type definitions
  const linkSchemas = extractLinkSchemas(data)
  const schemaLinkTypes = await Promise.all(
    linkSchemas.map(async ({ name, schema }) => {
      // Use the node generator to create proper interfaces for link schemas
      let cleanSchema = { ...schema }
      
      // If _node_schema exists, use it as the base schema
      if (schema._node_schema) {
        cleanSchema = { ...schema._node_schema }
      }
      
      // Remove OGM metadata
      delete cleanSchema._malevich_ogm_link
      delete cleanSchema._node_schema
      delete cleanSchema._node_name
      delete cleanSchema.$defs
      
      // Remove references to avoid external dependencies
      cleanSchema = removeReferences(cleanSchema)
      
      // Generate the interface using json-schema-to-typescript
      let interfaceCode = await compile(cleanSchema, name, {
        bannerComment: '',
        style: {
          singleQuote: true,
          semi: false
        }
      })
      
      // Clean up the generated code and fix required fields
      interfaceCode = interfaceCode
        .replace(/uid\?\s*:\s*string/g, 'uid: string')
        .replace(/created_at\?\s*:\s*string \| null/g, 'created_at?: string | null')
        .replace(/updated_at\?\s*:\s*string \| null/g, 'updated_at?: string | null')
      
      // Replace type alias references with direct types
      interfaceCode = interfaceCode
        .replace(/: CreatedAt/g, ': string | null')
        .replace(/: UpdatedAt/g, ': string | null') 
        .replace(/: Uid/g, ': string')
        .replace(/: [A-Z][a-zA-Z]*(?![a-z])/g, ': string')
        .replace(/uid\?\s*:/g, 'uid:')
      
      // Remove type aliases and keep only the interface
      const lines = interfaceCode.split('\n')
      const interfaceStart = lines.findIndex(line => line.startsWith('export interface'))
      if (interfaceStart !== -1) {
        return lines.slice(interfaceStart).join('\n')
      }
      
      return interfaceCode
    })
  )

  const mountLinkTypes = Array.from(usedLinkTypes)
    .filter(t => t !== 'Link' && !linkSchemas.some(l => l.name === t))
    .map(t => `export interface ${t} extends Base {}`)

  // Combine all parts
  const allImports = [baseImports, nodesImport].filter(Boolean).join('\n')
  const allLinkTypes = [...schemaLinkTypes, ...mountLinkTypes].join('\n\n')
  const allAbstractTypes = abstractResourceTypes.join('\n\n')
  const allMaterializedTypes = materializedResourceTypes.join('\n')
  const allCreateTypes = createResourceTypes.join('\n')
  const allUpdateTypes = updateResourceTypes.join('\n')
  const allLinkResourceTypes = linkResourceTypes.join('\n')

  const resourcesContent = [
    allImports,
    '',
    '// Link types',
    allLinkTypes,
    '',
    '// Abstract resource interfaces',
    allAbstractTypes,
    '',
    '// Materialized resource types',
    allMaterializedTypes,
    '',
    '// Create resource types',
    allCreateTypes,
    '',
    '// Update resource types', 
    allUpdateTypes,
    '',
    '// Link resource types',
    allLinkResourceTypes
  ].join('\n')

  writeFileSync(join(outDir, 'resources.ts'), resourcesContent, 'utf8')
}

function extractResourceSchemas(data: any): Array<{ name: string; schema: SchemaWithResource }> {
  const out: Array<{ name: string; schema: SchemaWithResource }> = []
  if (data.components?.schemas) {
    for (const [name, schema] of Object.entries(data.components.schemas)) {
      if ((schema as any)._resource) {
        out.push({ name, schema: schema as SchemaWithResource })
      }
    }
  }
  return out
}

function extractLinkSchemas(data: any): Array<{ name: string; schema: any }> {
  const out: Array<{ name: string; schema: any }> = []
  if (data.components?.schemas) {
    for (const [name, schema] of Object.entries(data.components.schemas)) {
      if ((schema as any)._malevich_ogm_link) {
        out.push({ name, schema })
      }
    }
  }
  return out
}

function findPivotField(schema: any, nodeType: string): string | null {
  // Use explicit pivot_key from _resource.info if available
  if (schema._resource?.info?.pivot_key) {
    return schema._resource.info.pivot_key
  }
  
  // Fallback to old logic if no explicit pivot_key
  if (!schema.properties) return null
  
  // Look for a field that matches the node type (case-insensitive)
  for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
    if (typeof fieldSchema === 'object' && fieldSchema !== null) {
      const field = fieldSchema as any
      
      // Skip ResourceEdge fields
      if (field.$ref && field.$ref.includes('ResourceEdge_')) continue
      if (field.anyOf && field.anyOf.some((variant: any) => 
        variant.$ref && variant.$ref.includes('ResourceEdge_')
      )) continue
      
      // Check if field name matches node type (case-insensitive)
      const fieldLower = fieldName.toLowerCase()
      const nodeLower = nodeType.toLowerCase()
      
      if (fieldLower === nodeLower || 
          fieldLower === nodeLower.replace(/([A-Z])/g, '_$1').toLowerCase() ||
          fieldLower.replace(/_/g, '') === nodeLower) {
        return fieldName
      }
    }
  }
  
  // Fallback: look for first non-ResourceEdge field
  for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
    if (typeof fieldSchema === 'object' && fieldSchema !== null) {
      const field = fieldSchema as any
      
      if (field.$ref && field.$ref.includes('ResourceEdge_')) continue
      if (field.anyOf && field.anyOf.some((variant: any) => 
        variant.$ref && variant.$ref.includes('ResourceEdge_')
      )) continue
      
      return fieldName
    }
  }
  
  return null
}

function mapResourceToNodeType(resourceName: string, schema?: any): string {
  // Use explicit pivot_type from _resource.info if available
  if (schema?._resource?.info?.pivot_type) {
    return schema._resource.info.pivot_type
  }
  
  // Handle special resource-to-node mappings (fallback)
  const mappings: Record<string, string> = {
    'BasicCaseResource': 'Case',
    'MessageResource': 'ChatMessage',
    'UserSystemLayoutResource': 'User',
    'CaseChangeResource': 'CaseChange',
    'TicketChangeResource': 'TicketChange',
    'CommentResource': 'Comment',
    'ContactResource': 'Contact',
    'SiteResource': 'Site',
    'OrganizationResource': 'Organization',
    'ClientCompanyResource': 'ClientCompany',
    'ClientCompanyInfo': 'ClientCompany',
    'CaseCategoryResource': 'CaseCategory',
    'CaseTypeResource': 'CaseType',
    'TicketTypeResource': 'TicketType',
    'ChatResource': 'Chat',
    'InvitationResource': 'Invitation',
    'TicketDetailResource': 'Ticket',
    'NotRestrictedTicketDetailResource': 'Ticket',
    'TicketResource': 'Ticket',
    'UserOrganizationResource': 'Organization'
  }
  
  if (mappings[resourceName]) {
    return mappings[resourceName]
  }
  
  // Default: remove Resource suffix
  if (resourceName.endsWith('Resource')) {
    return resourceName.slice(0, -8)
  }
  
  return resourceName
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