export interface Base {
  uid: string
  created_at?: string | null
  updated_at?: string | null
}

export interface Link extends Base {}

export type ResourceEdge<T, U> = {
  $resource: T
  $edges: U[]
}

export interface User extends Base {
  name: string
  email: string
}

export interface Task extends Base {
  title: string
  description?: string
  status?: string
}

