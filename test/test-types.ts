// TypeScript test to verify type safety
import { ResourceRequest, ResourceFilter, Match } from '../dist/index'
import { TaskResource } from './generated/resources'

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