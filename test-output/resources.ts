import type {
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
} from '@malevichai/nova-ts'
import type { Task } from './nodes'




export interface TaskResource extends AbstractResource<
  'task',
  Task,
  {}
> {}