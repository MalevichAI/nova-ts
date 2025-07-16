// Core resource types
export interface ResourceEdge<S, T> {
    $resource: S
    $edges: T[]
}

export interface ResourceEdgePayload<T> {
    $resource: string
    $edges: T[]
}

export type Resource<PivotType, PivotKey extends string> = {
    [K in PivotKey]: PivotType
}

export type Create<T> = Omit<T, keyof {uid: string, created_at: string, updated_at: string}>
export type Update<T> = Partial<Create<T>>

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
    $clauses: (Match | MatchEdge | Join | Exists)[]
}

export interface Exists extends FilterBase {
    $type: 'exists'
    $key: string
    $filter: Match | MatchEdge | Join | NoFilter
}

export interface SubresourceFilter extends FilterBase {
    $filter: Match | Join | Exists | MatchEdge
    $subresources?: Record<string, Match | MatchEdge | Join | SubresourceFilter>
}

export interface ResourceFilter extends FilterBase {
    $filter?: Match | Join | Exists
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