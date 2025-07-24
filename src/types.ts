export interface ResourceEdge<T, E> {
  $resource: T
  $edges: E[]
}

export interface Base {
    uid: string
    created_at?: string | null
    updated_at?: string | null
}

export interface Link extends Base {}

type ResourcePivot<PK extends string, PT> = Record<PK, PT>

export type Mount<T, LinkType, IsArray extends boolean> = {
    resource: T
    linkType: LinkType
    isArray: IsArray
}

export type Create<T> = Omit<T, 'uid' | 'created_at' | 'updated_at'>
export type Update<T> = Partial<Create<T>>

export type AbstractResource<
    PK extends string,
    PT extends Base,
    R extends Record<string, Mount<any, any, boolean>>,
> = {
    __pk: PK
    __pt: PT
    __r: R
}

export type MaterializedResource<T> = T extends { __pk: infer PK; __pt: infer PT; __r: infer R }
    ? ResourcePivot<PK & string, PT & Base> & {
        [key in keyof R]?: R[key] extends Mount<infer Resource, infer LinkType, infer IsArray>
            ? IsArray extends true 
                ? Resource extends AbstractResource<any, any, any> ? ResourceEdge<MaterializedResource<Resource>, LinkType>[] : ResourceEdge<Resource, LinkType>[]
                : Resource extends AbstractResource<any, any, any> ? ResourceEdge<MaterializedResource<Resource>, LinkType> : ResourceEdge<Resource, LinkType>
            : never
    }
    : never

export type CreateResource<T> = T extends { __pk: infer PK; __pt: infer PT; __r: infer R }
    ? ResourcePivot<PK & string, Create<PT>> & {
        [key in keyof R]?: R[key] extends Mount<infer Resource, infer LinkType, infer IsArray>
            ? IsArray extends true 
                ? ResourceEdge<Resource extends AbstractResource<any, any, any> ? CreateResource<Resource> : Create<Resource>, LinkType>[]
                : ResourceEdge<{uid: string}, LinkType>
            : never
    }
    : never 

export type UpdateResource<T> = T extends { __pk: infer PK; __pt: infer PT; __r: infer R }
    ? ResourcePivot<PK & string, Update<PT>> & {
        [key in keyof R]?: R[key] extends Mount<infer Resource, infer LinkType, infer IsArray>
            ? IsArray extends true 
                ? {$resource: string, $edges: (Update<LinkType> & {uid: string})[]}
                : {$resource: string, $edges: Update<LinkType> & {uid: string}}
            : never
    }
    : never

export type LinkResource<T> = T extends { __pk: infer PK; __pt: infer PT; __r: infer R }
    ? ResourcePivot<PK & string, string> & {
        [key in keyof R]?: R[key] extends Mount<infer Resource, infer LinkType, infer IsArray>
            ? IsArray extends true 
                ? {$resource: string, $edges: Create<LinkType>[]}[]
                : {$resource: string, $edges: Create<LinkType>[]}
            : never
    }
    : never

export type UnlinkResource<T> = never
export type DeleteResource<T> = never
