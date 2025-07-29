export interface OgmNode {
  label: string
  name: string
  relations?: Array<{
    cardinality: string
    incoming: boolean
    required: boolean
    target: string
    type: string
  }>
}

export interface OgmLink {
  source: string
  target: string
  type: string
}

export function isOgmNode(schema: any): boolean {
  return !!(schema?._malevich_ogm_node || schema?._node_schema?._malevich_ogm_node)
}

export function isOgmLink(schema: any): boolean {
  return !!(schema?._malevich_ogm_link || schema?._node_schema?._malevich_ogm_link)
}

export function getOgmMetadata(schema: any): { node?: OgmNode; link?: OgmLink } {
  const node = schema._malevich_ogm_node || schema._node_schema?._malevich_ogm_node
  const link = schema._malevich_ogm_link || schema._node_schema?._malevich_ogm_link
  return { node, link }
}

export function cleanupSchema(schema: any): any {
  let clean = { ...schema }
  
  if (schema._node_schema) {
    clean = { ...schema._node_schema }
  }
  
  delete clean._malevich_ogm_node
  delete clean._malevich_ogm_link
  delete clean._node_schema
  delete clean._node_name
  delete clean.$defs
  delete clean._resource
  
  return stripReferences(clean)
}

export function stripReferences(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stripReferences)
  }
  
  if (obj && typeof obj === 'object') {
    if (obj.$ref) {
      return { type: 'string', description: 'Reference to external schema' }
    }
    
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key !== '$ref') {
        result[key] = stripReferences(value)
      }
    }
    return result
  }
  
  return obj
}

export function getSchemaName(schema: any, fallback: string): string {
  return schema.title || 
         schema._node_name || 
         schema._malevich_ogm_node?.name || 
         schema._node_schema?._malevich_ogm_node?.name ||
         fallback
}