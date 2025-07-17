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


interface Base {
    uid: string
    created_at: string
    updated_at: string
}

type CreateNode<T extends Base> = Omit<T, 'uid' | 'createdAt' | 'updatedAt'> | { uid: string }
type UpdateNode<T extends Base> = Omit<T, 'uid' | 'createdAt' | 'updatedAt'> & { uid: string }

interface Resource<
  PivotType extends Base,
  PivotKey extends string,
  Additional extends Record<string, { resource: any; edge: any; array: boolean; arrayEdges: boolean; }> = Record<
    string,
    { resource: any; edge: any; array: boolean; arrayEdges: boolean; }
  >,    
  ResourceRouter extends string | null = null
> {}

interface Case extends Base {
    name: string
}

interface CaseChange extends Base {
    name: string
}

type CaseResource = Resource<Case, 'case', { changes: {
    resource: CaseChange
    edge: any
    array: true
    arrayEdges: true
} }, 'cases'>


type ProxyResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: P } & {
      [K in keyof Add]: Mount<
        Add[K]['resource'],
        Add[K]['edge'],
        Add[K]['array'],
        Add[K]['arrayEdges']
      >
    }
  : never

type CreateResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: CreateNode<P> } & {
      [K in keyof Add]: Mount<
        Add[K]['resource'] & { uid: string },
        Add[K]['edge'],
        Add[K]['array'],
        Add[K]['arrayEdges']
      > 
    }
  : never

type UpdateResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: UpdateNode<P> } 
  : never

type DeleteResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: { uid: string } }
  : never

type LinkResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: { uid: string } } & {
      [K in keyof Add]: { 
        $resource: { uid: string }
        $edges: Add[K]['edge']
      }
    }
  : never

type UnlinkResource<R> = R extends Resource<infer P, infer PK, infer Add, any>
  ? { [K in PK]: { uid: string } } & {
      [K in keyof Add]: { uid: string }[]
    }
  : never
