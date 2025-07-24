// TypeScript test to verify type safety using local relative imports
import type { 
  ResourceRequest, 
  ResourceFilter, 
  Match, 
  ResourceEdge,
  Link,
  AbstractResource,
  MaterializedResource,
  Mount
} from '../src/index'

// Import generated node types
interface User {
  uid: string
  created_at: string
  updated_at: string
  name: string
  email: string
}

interface Task {
  uid: string
  created_at: string
  updated_at: string
  title: string
  description?: string
  status?: string
}

// Define TaskResource locally for testing
interface TaskResourceAbstract extends AbstractResource<'task', Task, {
  assigned_to: Mount<User, Link, false>
}> {}

type TaskResource = MaterializedResource<TaskResourceAbstract>

// Test type-safe resource request
const taskRequest: ResourceRequest<TaskResource, 'task'> = {
  filter: {
    $filter: {
      $type: 'match',
      $field: 'task.title',
      $value: 'Complete project',
      $operation: '='
    }
  },
  limit: 10,
  sort: ['task.created_at'],
  subresources: {
    assigned_to: {
      filter: {
        $type: 'match',
        $field: 'name', 
        $value: 'John Doe'
      },
      limit: 1
    }
  }
}

// Test creating filters
const titleFilter: Match = {
  $type: 'match',
  $field: 'task.title',
  $value: 'Important Task',
  $operation: 'CONTAINS'
}

const resourceFilter: ResourceFilter = {
  $filter: titleFilter
}

// Test the generated types work correctly
console.log('✅ TypeScript compilation successful')
console.log('✅ TaskRequest type is properly constrained')
console.log('✅ Filter types work correctly')

export { taskRequest, titleFilter, resourceFilter } 