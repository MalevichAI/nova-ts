// Core resource types
export interface ResourceEdge<S, T> {
    $resource: S
    $edges: T[]
}

export interface ResourceEdgePayload<T> {
    $resource: string
    $edges: T[]
}

// ================= Resource modelling =================

// Generic helpers for mounted sub-resources
interface MountedResource<S, T> {
    $resource: S
    $edges: T[]
}

interface MountedResourceSingleEdge<S, T> {
    $resource: S
    $edge: T
}

type SingleMountSingleEdge<S, T> = MountedResourceSingleEdge<S, T>
type SingleMountMultipleEdges<S, T> = MountedResource<S, T>
type ArrayMountSingleEdge<S, T> = MountedResourceSingleEdge<S, T>[]
type ArrayMountMultipleEdges<S, T> = MountedResource<S, T>[]
type Mounted<S, T> =
  | MountedResource<S, T>
  | MountedResourceSingleEdge<S, T>
  | MountedResource<S, T>[]
  | MountedResourceSingleEdge<S, T>[]

type Mount<SR, SE, Arr extends boolean, ArrE extends boolean> = Arr extends true
  ? ArrE extends true
    ? ArrayMountMultipleEdges<SR, SE>
    : ArrayMountSingleEdge<SR, SE>
  : ArrE extends true
  ? SingleMountMultipleEdges<SR, SE>
  : SingleMountSingleEdge<SR, SE>

// Base node properties (matches generated node types)
export interface Base {
    uid: string
    created_at?: string | null
    updated_at?: string | null
}

// Primary Resource marker – extra generics allow rich meta but remain nominal
export interface Resource<
  PivotType extends Base,
  PivotKey extends string,
  Additional extends Record<string, { resource: any; edge: any; array: boolean; arrayEdges: boolean }> = Record<string, { resource: any; edge: any; array: boolean; arrayEdges: boolean }>,
  ResourceRouter extends string | null = null
> {}

// CRUD helpers
export type CreateModel<T extends Base> = Omit<T, 'uid' | 'created_at' | 'updated_at'> | { uid: string }
export type UpdateModel<T extends Base> = Omit<T, 'uid' | 'created_at' | 'updated_at'> & { uid: string }

export type ProxyResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: P } & {
      [K in keyof Add]: Mount<
        Add[K]['resource'],
        Add[K]['edge'],
        Add[K]['array'],
        Add[K]['arrayEdges']
      >
    }
  : never

export type CreateResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: CreateModel<P> } & {
      [K in keyof Add]: Mount<
        Add[K]['resource'] & { uid: string },
        Add[K]['edge'],
        Add[K]['array'],
        Add[K]['arrayEdges']
      >
    }
  : never

export type UpdateResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: UpdateModel<P> } & {
    [K in keyof Add]: (Add[K]['array'] extends true ? {
      $resource: string,
      $edges: UpdateModel<Add[K]['edge']>[]
    }[] : {
      $resource: string,
      $edges: UpdateModel<Add[K]['edge']>[]
    })
  } : never


export type DeleteResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: { uid: string } }
  : never

export type LinkResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: { uid: string } } & {
      [K in keyof Add]: {
        $resource: { uid: string }
        $edges: Add[K]['edge']
      }
    }
  : never

export type UnlinkResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: { uid: string } } & {
      [K in keyof Add]: { uid: string }[]
    }
  : never

// Simple convenience wrappers matching previous API
export type Create<T extends Base> = CreateModel<T>
export type Update<T extends Base> = UpdateModel<T>

// === Helper constructors ===
export function proxy<R>(value: ProxyResource<R>): ProxyResource<R> {
    return value
}

export function create<R>(value: CreateResource<R>): CreateResource<R> {
    return value
}

export interface OnlyUID {
    uid: string
}

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

// Link type for edges
export interface Link {
    [key: string]: any
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
    