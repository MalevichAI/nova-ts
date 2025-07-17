import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { generate as generateNodes } from './generator.js'

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

  // 1. Nodes file (reuse existing generator)
  const nodesTs = await generateNodes(schemaPath)
  writeFileSync(join(outDir, 'nodes.ts'), nodesTs, 'utf8')

  // 2. Collect resource schemas
  const resourceSchemas = extractResourceSchemas(data)
  const proxySchemas = resourceSchemas.filter(s => s.schema._resource?.type === 'proxy')

  // Track referenced node types so we can generate proper imports later
  const referencedTypes = new Set<string>()

  const resourceInterfaces: string[] = []
  const usedEdgeTypes = new Set<string>()
  for (const { name, schema } of proxySchemas) {
    const meta = (schema._resource as any) || {}
    const info = meta.info || {}

    const pivotType: string = info.pivot_type || mapResourceToNodeType(name, schema)
    const pivotKey: string = info.pivot_key || findPivotField(schema, pivotType) || 'uid'
    referencedTypes.add(pivotType)

    const mounts = info.mounts ? Object.entries(info.mounts) : []
    const mountLines = mounts
      .map(([mountKey, mountInfo]: [string, any]) => {
        let resType = 'any'
        const edgeType = mountInfo?.relation_model ?? 'Link'
        usedEdgeTypes.add(edgeType)
        if (mountInfo && mountInfo.pivot_type) {
          if (mountInfo.is_resource) {
            resType = mountInfo.info?.name ?? `${mountInfo.pivot_type}Resource`
            // resource types are defined in same file, no node import needed
          } else {
            resType = mountInfo.pivot_type
            referencedTypes.add(resType)
          }
        }
        const arr = mountInfo?.is_array ? 'true' : 'false'
        const arrEdges = 'true'
        return `    ${mountKey}: { resource: ${resType}; edge: ${edgeType}; array: ${arr}; arrayEdges: ${arrEdges} }`
      })
      .join(',\n')

    const additionalBlock = mountLines ? `{\n${mountLines}\n  }` : '{}'

    const typeDef = `export type ${name} = Resource<${pivotType}, '${pivotKey}', ${additionalBlock}>`
    resourceInterfaces.push(typeDef)
  }

      // Import from @malevichai/nova-ts package for base types and filters
  const novaImport = `import type { 
  ResourceEdge, 
  ResourceEdgePayload, 
  Link, 
  Resource, 
  Create, 
  Update,
  ResourceRequest,
  SubresourceRequest,
  FilterBase,
  NoFilter,
  Match,
  MatchEdge,
  Join,
  Exists,
  SubresourceFilter,
  ResourceFilter,
  AnyFilter,
  SupportedComparisonOps,
  SupportedLogicalOps
} from '@malevichai/nova-ts'\n`

  // Replace verbose ResourceEdge_* types with generic ResourceEdge<S, Link>
  const simplified = resourceInterfaces.join('\n\n')

  const nodeTypeNames = Array.from(referencedTypes).filter(t => 
    t !== 'Link' && 
    !t.startsWith('ResourceEdge_') && 
    !t.endsWith('Resource') &&
    t !== 'ClientCompanyInfo'  // This is a resource schema, not a node
  )
  const nodesImport = nodeTypeNames.length
    ? `import type { ${nodeTypeNames.sort().join(', ')} } from './nodes'\n`
    : ''
  const importLine = novaImport + nodesImport + '\n'

  // Simple marker interfaces for link schemas and per-mount edges
  const schemaLinkNames = extractLinkSchemas(data).map(({ name }) => name)
  const schemaLinkInterfaces = schemaLinkNames
    .map(name => `export interface ${name} extends Link {}`)
    .join('\n')

  const mountLinkInterfaces = Array.from(usedEdgeTypes)
    .filter(t => t !== 'Link' && !schemaLinkNames.includes(t))
    .map(t => `export interface ${t} extends Link {}`)
    .join('\n')

  const resourcesContent = importLine + schemaLinkInterfaces + '\n' + mountLinkInterfaces + '\n\n' + simplified
  writeFileSync(join(outDir, 'resources.ts'), resourcesContent, 'utf8')

  // 3. Base file - now just re-exports from @malevichai/nova-ts
  const baseContent = `// Re-export base types from @malevichai/nova-ts package
export type { 
  ResourceEdge, 
  ResourceEdgePayload, 
  Link, 
  Resource, 
  Create, 
  Update,
  ResourceRequest,
  SubresourceRequest,
  FilterBase,
  NoFilter,
  Match,
  MatchEdge,
  Join,
  Exists,
  SubresourceFilter,
  ResourceFilter,
  AnyFilter,
  SupportedComparisonOps,
  SupportedLogicalOps
} from '@malevichai/nova-ts'
`
  writeFileSync(join(outDir, 'base.ts'), baseContent, 'utf8')
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

// fallback remove refs if util not present
function removeReferences(obj: any, referencedTypes: Set<string>): any {
  if (obj && typeof obj === 'object') {
    // Handle anyOf with array and null (like changes?: Changes | null)
    if (obj.anyOf && Array.isArray(obj.anyOf)) {
      const arrayVariant = obj.anyOf.find((variant: any) => 
        variant.type === 'array' && variant.items && variant.items.$ref
      )
      if (arrayVariant) {
        const ref: string = arrayVariant.items.$ref
        const arrMatch = ref.match(/#\/components\/schemas\/ResourceEdge_(\w+)_Link_/)
        if (arrMatch) {
          const origin = arrMatch[1]
          // Handle special cases where Resource suffix should be dropped
          const nodeType = mapResourceToNodeType(origin)
          referencedTypes.add(nodeType)
          return { tsType: `ResourceEdge<${nodeType}, Link>[] | null` }
        }
        
        // Also handle ControlLink variants
        const controlArrMatch = ref.match(/#\/components\/schemas\/ResourceEdge_(\w+)_ControlLink_/)
        if (controlArrMatch) {
          const origin = controlArrMatch[1]
          const nodeType = mapResourceToNodeType(origin)
          referencedTypes.add(nodeType)
          return { tsType: `ResourceEdge<${nodeType}, Link>[] | null` }
        }
        
        // Handle any other ResourceEdge patterns (like ChannelToContact, TicketSubtask, etc.)
        const generalArrMatch = ref.match(/#\/components\/schemas\/ResourceEdge_(\w+)_(\w+)_/)
        if (generalArrMatch) {
          const origin = generalArrMatch[1]
          const nodeType = mapResourceToNodeType(origin)
          referencedTypes.add(nodeType)
          return { tsType: `ResourceEdge<${nodeType}, Link>[] | null` }
        }
      }
    }

    // Handle arrays of ResourceEdge_* links (direct array case)
    if (obj.type === 'array' && obj.items && typeof obj.items === 'object' && obj.items.$ref) {
      const ref: string = obj.items.$ref
      const arrMatch = ref.match(/#\/components\/schemas\/ResourceEdge_(\w+)_Link_/)
      if (arrMatch) {
        const origin = arrMatch[1]
        const nodeType = mapResourceToNodeType(origin)
        referencedTypes.add(nodeType)
        return { tsType: `ResourceEdge<${nodeType}, Link>[]` }
      }
      
      // Also handle ControlLink variants
      const controlArrMatch = ref.match(/#\/components\/schemas\/ResourceEdge_(\w+)_ControlLink_/)
      if (controlArrMatch) {
        const origin = controlArrMatch[1]
        const nodeType = mapResourceToNodeType(origin)
        referencedTypes.add(nodeType)
        return { tsType: `ResourceEdge<${nodeType}, Link>[]` }
      }
      
      // Handle any other ResourceEdge patterns (like ChannelToContact, TicketSubtask, etc.)
      const generalArrMatch = ref.match(/#\/components\/schemas\/ResourceEdge_(\w+)_(\w+)_/)
      if (generalArrMatch) {
        const origin = generalArrMatch[1]
        const nodeType = mapResourceToNodeType(origin)
        referencedTypes.add(nodeType)
        return { tsType: `ResourceEdge<${nodeType}, Link>[]` }
      }
    }

    // Handle single ResourceEdge_* references
    if (obj.$ref && typeof obj.$ref === 'string') {
      const ref: string = obj.$ref
      const match = ref.match(/#\/components\/schemas\/(\w+)/)
      if (match) {
        const schemaName = match[1]
        
        // Handle ResourceEdge_X_Y_ patterns
        const edgeMatch = schemaName.match(/^ResourceEdge_(\w+)_Link_$/)
        if (edgeMatch) {
          const origin = edgeMatch[1]
          const nodeType = mapResourceToNodeType(origin)
          referencedTypes.add(nodeType)
          return { tsType: `ResourceEdge<${nodeType}, Link>` }
        }
        
        // Handle ResourceEdge_X_ControlLink_ patterns
        const controlEdgeMatch = schemaName.match(/^ResourceEdge_(\w+)_ControlLink_$/)
        if (controlEdgeMatch) {
          const origin = controlEdgeMatch[1]
          const nodeType = mapResourceToNodeType(origin)
          referencedTypes.add(nodeType)
          return { tsType: `ResourceEdge<${nodeType}, Link>` }
        }
        
        // Handle any other ResourceEdge patterns (like ChannelToContact, TicketSubtask, etc.)
        const generalEdgeMatch = schemaName.match(/^ResourceEdge_(\w+)_(\w+)_$/)
        if (generalEdgeMatch) {
          const origin = generalEdgeMatch[1]
          const nodeType = mapResourceToNodeType(origin)
          referencedTypes.add(nodeType)
          return { tsType: `ResourceEdge<${nodeType}, Link>` }
        }
        
        // Handle regular node references (but exclude ClientCompanyInfo which is a resource, not a node)
        if (!schemaName.endsWith('Resource') && schemaName !== 'ClientCompanyInfo') {
          referencedTypes.add(schemaName)
          return { tsType: schemaName }
        }
      }
      
      // For everything else, strip the reference
      return { type: 'string' }
    }

    // Recursively process object properties
    const result: any = Array.isArray(obj) ? [] : {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = removeReferences(value, referencedTypes)
    }
    return result
  }

  return obj
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