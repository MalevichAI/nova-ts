import { ResourceEdge, Base, Create, Update, AbstractResource, MaterializedResource, CreateResource, UpdateResource, LinkResource, Mount, Link } from './types.js'

// Operator types
export type SupportedComparisonOps = '=' | '<' | '>' | '<=' | '>=' | '<>' | 'IN' | 'CONTAINS' | 'STARTS WITH' | 'ENDS WITH' | '=~'
export type SupportedLogicalOps = 'AND' | 'OR' | 'NOT' | 'XOR'

// Filter interfaces
export interface FilterBase {}

export interface NoFilter extends FilterBase {
    $type: 'empty'
}

export interface Match extends FilterBase {
    $type: 'match'
    $field: string
    $value: any
    $operation?: SupportedComparisonOps
    $at?: string
}

export interface MatchEdge extends FilterBase {
    $type: 'match_edge'
    $field: string
    $value: any
    $operation?: SupportedComparisonOps
    $at?: string
}

export interface Join extends FilterBase {
    $type: 'join'
    $operation?: SupportedLogicalOps
    $clauses: AnyFilter[]
}

export interface Exists extends FilterBase {
    $type: 'exists'
    $key: string
    $filter: AnyFilter
}

export interface SubresourceFilter extends FilterBase {
    $filter?: AnyFilter
    $subresources?: Record<string, AnyFilter>
}

export interface ResourceFilter extends FilterBase {
    $filter?: AnyFilter
}

export type AnyFilter = Match | MatchEdge | Join | Exists | SubresourceFilter | ResourceFilter | NoFilter

// Request interfaces
export interface SubresourceRequest<PivotType, PivotKey> {
    filter?: Match | Join | Exists | MatchEdge | SubresourceFilter
    limit?: number
    skip?: number
    sort?: string[]
    include_fields?: string[]
    exclude_fields?: string[]
    include_subresources?: string[]
    exclude_subresources?: string[]
    subresources?: Record<Exclude<keyof PivotType, PivotKey>, SubresourceRequest<PivotType[Exclude<keyof PivotType, PivotKey>], PivotKey>>
}

export interface ResourceRequest<PivotType, PivotKey> {
    filter?: ResourceFilter
    limit?: number
    skip?: number
    sort?: string[]
    include_fields?: string[]
    exclude_fields?: string[]
    include_subresources?: string[]
    exclude_subresources?: string[]
    subresources?: Record<Exclude<keyof PivotType, PivotKey>, SubresourceRequest<PivotType[Exclude<keyof PivotType, PivotKey>], PivotKey>>
} 

export function isSubresourceFilter(f: AnyFilter | undefined): f is SubresourceFilter {
    return !!f && typeof f === 'object' && '$subresources' in f
}

export function isResourceFilter(f: AnyFilter | undefined): f is ResourceFilter {
    return !!f && typeof f === 'object' && !('$type' in f) && !('$subresources' in f)
}

export function merge(a: AnyFilter | undefined, b: AnyFilter | undefined, operation: 'AND' | 'OR' = 'AND'): AnyFilter {
    if (!a) return b || { $type: 'empty' }
    if (!b) return a
    
    if ((a as any).$type === 'empty') return b
    if ((b as any).$type === 'empty') return a
    
    if (isResourceFilter(a) && isResourceFilter(b)) {
        return {
            ...a,
            $filter: merge(a.$filter, b.$filter)
        }
    }
    
    if (isSubresourceFilter(a) && isSubresourceFilter(b)) {
        const filter = merge(a.$filter, b.$filter)
        if (!a.$subresources) return { ...b, $filter: filter }
        if (!b.$subresources) return { ...a, $filter: filter }
        
        const keys = new Set([...Object.keys(a.$subresources), ...Object.keys(b.$subresources)])
        const subresources: Record<string, any> = {}
        
        for (const key of keys) {
            subresources[key] = merge(a.$subresources[key], b.$subresources[key])
        }
        
        return { ...a, $filter: filter, $subresources: subresources }
    }
    
    if (isSubresourceFilter(a) && isResourceFilter(b)) {
        return { ...a, $filter: merge(a.$filter, b.$filter) }
    }
    
    if (isResourceFilter(a) && isSubresourceFilter(b)) {
        return { ...b, $filter: merge(a.$filter, b.$filter) }
    }
    
    const isMatchType = (f: AnyFilter): boolean => {
        return (f as any).$type === 'match' || (f as any).$type === 'match_edge' || (f as any).$type === 'join' || (f as any).$type === 'exists'
    }

    if ((isResourceFilter(a) || isSubresourceFilter(a)) && isMatchType(b)) {
        return { ...a, $filter: merge((a as any).$filter, b) }
    }
    
    if ((isResourceFilter(b) || isSubresourceFilter(b)) && isMatchType(a)) {
        return { ...b, $filter: merge(a, (b as any).$filter) }
    }
    
    return {
        $type: 'join',
        $operation: operation,
        $clauses: [a, b]
    }
}

export function combine(...filters: AnyFilter[]): AnyFilter {
    if (filters.length === 0) return { $type: 'empty' }
    if (filters.length === 1) return filters[0]
    
    return filters.reduce((acc, current) => merge(acc, current))
}

// Export new types from types.ts for compatibility
export type {
  ResourceEdge,
  Base,
  Create,
  Update,
  AbstractResource,
  MaterializedResource,
  CreateResource,
  UpdateResource,
  LinkResource,
  UnlinkResource,
  DeleteResource,
  Mount,
  Link
} from './types.js'
    