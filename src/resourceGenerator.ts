import { generate as generateNodes } from './generator.js'
import { getSchema } from './schemaLoader.js'
import { cleanupSchema, isOgmLink } from './ogmHelpers.js'
import { resourceOptionsManager } from './options.js'
import { ResourceOptions } from './types.js'

// Helper functions for Node.js operations with environment detection
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { existsSync, mkdirSync } = await import('node:fs')
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
  } else {
    throw new Error('Directory operations are not available in browser environment')
  }
}

async function writeFile(filePath: string, content: string): Promise<void> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(filePath, content, 'utf8')
  } else {
    throw new Error('File system operations are not available in browser environment')
  }
}

async function joinPath(...paths: string[]): Promise<string> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { join } = await import('node:path')
    return join(...paths)
  } else {
    // Simple path joining for browser environments (though this shouldn't be used there)
    return paths.join('/')
  }
}

// New functions for handling dedicated resource/node endpoints
async function isResourceEndpoint(source: string): Promise<boolean> {
  return source.includes('/resources.json')
}

async function isNodeEndpoint(source: string): Promise<boolean> {
  return source.includes('/nodes.json')
}

async function isNovaServer(source: string): Promise<boolean> {
  // Check if source looks like a base URL that could have Nova endpoints
  if (typeof source !== 'string') return false
  
  // Must be a URL and not already pointing to a specific endpoint
  if (!source.startsWith('http://') && !source.startsWith('https://')) return false
  if (source.includes('.json') || source.includes('/openapi')) return false
  
  return true
}

async function checkEndpointAvailability(url: string): Promise<boolean> {
  try {
    // Try to fetch a small amount of data to check if endpoint exists
    await getSchema(url)
    return true
  } catch {
    return false
  }
}

async function detectNovaEndpoints(baseUrl: string): Promise<{
  hasResources: boolean
  hasNodes: boolean
  resourcesUrl: string
  nodesUrl: string
}> {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
  const resourcesUrl = `${cleanBaseUrl}/resources.json`
  const nodesUrl = `${cleanBaseUrl}/nodes.json`
  
  const [hasResources, hasNodes] = await Promise.all([
    checkEndpointAvailability(resourcesUrl),
    checkEndpointAvailability(nodesUrl)
  ])
  
  return { hasResources, hasNodes, resourcesUrl, nodesUrl }
}

async function fetchResourcesData(source: string): Promise<Record<string, any>> {
  const data = await getSchema(source)
  return data as Record<string, any>
}

async function fetchNodesData(source: string): Promise<Record<string, any>> {
  const data = await getSchema(source)  
  return data as Record<string, any>
}

function processResourcesFromEndpoint(resourcesData: Record<string, any>): Map<string, ResourceOptions> {
  const resourceOptions = new Map<string, ResourceOptions>()
  
  for (const [resourceName, resourceInfo] of Object.entries(resourcesData)) {
    if (resourceInfo && typeof resourceInfo === 'object') {
      const options: ResourceOptions = {
        info: {
          name: resourceInfo.name || resourceName,
          description: resourceInfo.description,
          pivot_key: resourceInfo.pivot_key,
          pivot_type: resourceInfo.pivot_type,
          pivot_description: resourceInfo.pivot_description,
          display_name: resourceInfo.display_name,
          mounts: resourceInfo.mounts || {},
          computed: resourceInfo.computed || {}
        }
      }
      
      resourceOptions.set(resourceName, options)
      resourceOptionsManager.setResourceOptions(resourceName, options)
    }
  }
  
  return resourceOptions
}

function processNodesFromEndpoint(nodesData: Record<string, any>): any {
  // Convert nodes data to OpenAPI-like format for compatibility with existing generator
  const components = {
    schemas: {} as Record<string, any>
  }
  
  for (const [nodeName, nodeSchema] of Object.entries(nodesData)) {
    if (nodeSchema && typeof nodeSchema === 'object') {
      // Transform node schema to be compatible with existing generator
      const transformedSchema = {
        ...nodeSchema,
        'x-ogm-link': nodeSchema._malevich_ogm_node ? true : false
      }
      components.schemas[nodeName] = transformedSchema
    }
  }
  
  return { components }
}

async function generateFromResourcesEndpoint(source: string, outDir: string): Promise<void> {
  console.log(`🔄 Generating from resources endpoint: ${source}`)
  
  // Fetch resources data
  const resourcesData = await fetchResourcesData(source)
  
  // Process resources into options
  const resourceOptions = processResourcesFromEndpoint(resourcesData)
  
  // Generate options file
  if (resourceOptions.size > 0) {
    await generateAllResourceOptionsFile(resourceOptions, outDir)
    console.log(`✅ Generated options.ts with ${resourceOptions.size} resources from /resources.json`)
  } else {
    console.log('⚠️  No resources found in /resources.json endpoint')
  }
  
  // For resources endpoint, we might need to fetch nodes separately or skip nodes generation
  console.log(`📝 Note: Only resource options generated. For complete types, also process /nodes.json endpoint.`)
}

async function generateFromNodesEndpoint(source: string, outDir: string): Promise<void> {
  console.log(`🔄 Generating from nodes endpoint: ${source}`)
  
  // Fetch nodes data
  const nodesData = await fetchNodesData(source)
  
  // Process nodes data to be compatible with existing generator
  const processedData = processNodesFromEndpoint(nodesData)
  
  // Generate nodes file
  const nodesTs = await generateNodes(processedData)
  await writeFile(await joinPath(outDir, 'nodes.ts'), nodesTs)
  console.log(`✅ Generated nodes.ts with ${Object.keys(nodesData).length} node types from /nodes.json`)
  
  // For nodes endpoint, we don't have resource options, so skip that part
  console.log(`📝 Note: Only node types generated. For resource options, also process /resources.json endpoint.`)
}

// Helper function to generate from both endpoints in sequence
export async function generateFromBothEndpoints(resourcesUrl: string, nodesUrl: string, outDir: string): Promise<void> {
  console.log(`🔄 Generating from both endpoints...`)
  console.log(`   Resources: ${resourcesUrl}`)
  console.log(`   Nodes: ${nodesUrl}`)
  
  await ensureDirectoryExists(outDir)
  
  // Generate from resources endpoint
  const resourcesData = await fetchResourcesData(resourcesUrl)
  const resourceOptions = processResourcesFromEndpoint(resourcesData)
  
  // Generate from nodes endpoint
  const nodesData = await fetchNodesData(nodesUrl)
  const processedNodesData = processNodesFromEndpoint(nodesData)
  
  // Generate all files
  const nodesTs = await generateNodes(processedNodesData)
  await writeFile(await joinPath(outDir, 'nodes.ts'), nodesTs)
  
  if (resourceOptions.size > 0) {
    await generateAllResourceOptionsFile(resourceOptions, outDir)
  }
  
  console.log(`✅ Generated complete types:`)
  console.log(`   - nodes.ts: ${Object.keys(nodesData).length} node types`)
  console.log(`   - options.ts: ${resourceOptions.size} resource options`)
}

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
  await ensureDirectoryExists(outDir)
  
  // Handle specific Nova endpoint URLs (legacy support)
  if (typeof source === 'string' && await isResourceEndpoint(source)) {
    await generateFromResourcesEndpoint(source, outDir)
    return
  }
  
  if (typeof source === 'string' && await isNodeEndpoint(source)) {
    await generateFromNodesEndpoint(source, outDir)
    return
  }
  
  // Smart Nova detection - try Nova endpoints first
  if (typeof source === 'string' && await isNovaServer(source)) {
    console.log(`🔍 Detecting Nova endpoints at ${source}...`)
    
    try {
      const { hasResources, hasNodes, resourcesUrl, nodesUrl } = await detectNovaEndpoints(source)
      
      if (hasResources && hasNodes) {
        console.log(`✅ Found both Nova endpoints, using Nova generation`)
        await generateFromBothEndpoints(resourcesUrl, nodesUrl, outDir)
        return
      } else if (hasResources) {
        console.log(`✅ Found /resources.json endpoint, generating resource options only`)
        console.log(`⚠️  /nodes.json not available - node types will not be generated`)
        await generateFromResourcesEndpoint(resourcesUrl, outDir)
        return
      } else if (hasNodes) {
        console.log(`✅ Found /nodes.json endpoint, generating node types only`) 
        console.log(`⚠️  /resources.json not available - resource options will not be generated`)
        await generateFromNodesEndpoint(nodesUrl, outDir)
        return
      } else {
        console.log(`ℹ️  No Nova endpoints found, falling back to OpenAPI generation`)
      }
    } catch (error) {
      console.log(`⚠️  Error detecting Nova endpoints, falling back to OpenAPI generation`)
      console.log(`   ${(error as Error).message}`)
    }
  }
  
  // Fallback to traditional OpenAPI schema generation
  console.log(`🔄 Using traditional OpenAPI generation...`)
  const data = await getSchema(source) as any

  const nodesTs = await generateNodes(data)
  await writeFile(await joinPath(outDir, 'nodes.ts'), nodesTs)

  // Extract resource options from routes
  const resourceOptions = extractResourceOptionsFromRoutes(data)
  
  // Generate single options file with all resources
  if (resourceOptions.size > 0) {
    await generateAllResourceOptionsFile(resourceOptions, outDir)
    console.log(`✅ Generated options.ts with ${resourceOptions.size} resources`)
  }

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

  const resourcesPath = await joinPath(outDir, 'resources.ts')
  await writeFile(resourcesPath, output)
  console.log(`✅ Generated resources to ${resourcesPath}`)
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

function extractResourceOptionsFromRoutes(data: any): Map<string, ResourceOptions> {
  const resourceOptions = new Map<string, ResourceOptions>()
  
  if (data.paths) {
    for (const [path, pathObj] of Object.entries(data.paths)) {
      if (typeof pathObj === 'object' && pathObj !== null) {
        const pathMethods = pathObj as any
        
        for (const [method, operation] of Object.entries(pathMethods)) {
          if (typeof operation === 'object' && operation !== null) {
            const op = operation as any
            
            if (op['x-nova-resource']) {
              const xNovaResource = op['x-nova-resource']
              
              // Handle array format (multiple resources in one operation)
              if (Array.isArray(xNovaResource)) {
                for (const resourceInfo of xNovaResource) {
                  if (resourceInfo?.name) {
                    // Convert direct resource info to expected ResourceOptions format
                    const options: ResourceOptions = {
                      info: {
                        name: resourceInfo.name,
                        pivot_key: resourceInfo.pivot_key,
                        pivot_type: resourceInfo.pivot_type,
                        mounts: resourceInfo.mounts || {},
                        computed: resourceInfo.computed || {},
                        ...(resourceInfo.description && { description: resourceInfo.description }),
                        ...(resourceInfo.pivot_description && { pivot_description: resourceInfo.pivot_description }),
                        ...(resourceInfo.display_name && { display_name: resourceInfo.display_name })
                      }
                    }
                    resourceOptions.set(resourceInfo.name, options)
                    resourceOptionsManager.setResourceOptions(resourceInfo.name, options)
                  }
                }
              } 
              // Handle object format with info wrapper
              else if (xNovaResource.info?.name) {
                const options = xNovaResource as ResourceOptions
                resourceOptions.set(options.info.name, options)
                resourceOptionsManager.setResourceOptions(options.info.name, options)
              }
              // Handle direct resource info object
              else if (xNovaResource?.name) {
                const options: ResourceOptions = {
                  info: {
                    name: xNovaResource.name,
                    pivot_key: xNovaResource.pivot_key,
                    pivot_type: xNovaResource.pivot_type,
                    mounts: xNovaResource.mounts || {},
                    computed: xNovaResource.computed || {},
                    ...(xNovaResource.description && { description: xNovaResource.description }),
                    ...(xNovaResource.pivot_description && { pivot_description: xNovaResource.pivot_description }),
                    ...(xNovaResource.display_name && { display_name: xNovaResource.display_name })
                  }
                }
                resourceOptions.set(xNovaResource.name, options)
                resourceOptionsManager.setResourceOptions(xNovaResource.name, options)
              }
            }
          }
        }
      }
    }
  }
  
  return resourceOptions
}

function cleanOptionsObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined
  }
  
  if (Array.isArray(obj)) {
    return obj.map(cleanOptionsObject).filter(item => item !== undefined)
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {}
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = cleanOptionsObject(value)
      if (cleanedValue !== undefined && cleanedValue !== null) {
        cleaned[key] = cleanedValue
      }
    }
    
    // Ensure required properties exist for ResourceInfo objects
    if (cleaned.name && cleaned.pivot_key && cleaned.pivot_type) {
      if (!cleaned.mounts) cleaned.mounts = {}
      if (!cleaned.computed) cleaned.computed = {}
    }
    
    return Object.keys(cleaned).length > 0 ? cleaned : undefined
  }
  
  return obj
}

async function generateAllResourceOptionsFile(resourceOptions: Map<string, ResourceOptions>, outDir: string): Promise<void> {
  const filePath = await joinPath(outDir, 'options.ts')
  
  let content = `import { ResourceOptions } from '@malevichai/nova-ts'\n\n`
  
  const optionsArray: Array<{name: string, options: ResourceOptions}> = []
  
  for (const [resourceName, options] of resourceOptions) {
    const sanitized = sanitizeName(resourceName)
    const cleanedOptions = cleanOptionsObject(options)
    
    content += `export const ${sanitized}Options: ResourceOptions = ${JSON.stringify(cleanedOptions, null, 2)}\n\n`
    optionsArray.push({name: sanitized, options: cleanedOptions})
  }
  
  // Create a master options object
  content += `export const AllResourceOptions = {\n`
  for (const {name} of optionsArray) {
    content += `  ${name}: ${name}Options,\n`
  }
  content += `} as const\n\n`
  
  // Create a type-safe getter function
  content += `export function getResourceOptions(resourceName: string): ResourceOptions | undefined {\n`
  content += `  return (AllResourceOptions as any)[resourceName + 'Options']\n`
  content += `}\n\n`
  
  // Export resource names
  content += `export const ResourceNames = [\n`
  for (const {name} of optionsArray) {
    content += `  '${name}',\n`
  }
  content += `] as const\n\n`
  
  content += `export type ResourceName = typeof ResourceNames[number]\n`
  
  await writeFile(filePath, content)
} 