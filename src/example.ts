// Example usage of @malevichai/nova-ts package
import type {
    ResourceEdge,
    ResourceEdgePayload,
    Resource,
    Create,
    Update,
    OnlyUID,
    Link,
    ResourceRequest,
    SubresourceRequest,
    ResourceFilter,
    Match,
    SupportedComparisonOps
} from '@malevichai/nova-ts'

// Example node types (these would be generated)
interface AccessIdentity {
    uid: string
    created_at: string
    updated_at: string
}

interface TicketChange {
    uid: string
    created_at: string
    updated_at: string
}

// Example resource extending the generic Resource type
export interface TicketChangeResource extends Resource<TicketChange, 'change'> {
    changed_by?: ResourceEdge<AccessIdentity, Link> | null
    change: TicketChange
}

// Example usage with type-safe requests
const exampleRequest: ResourceRequest<TicketChangeResource, 'change'> = {
    filter: {
        $filter: {
            $type: 'match',
            $field: 'change.uid',
            $value: '123',
            $operation: '='
        }
    },
    subresources: {
        changed_by: {
            filter: {
                $type: 'match',
                $field: 'uid',
                $value: 'user-123'
            }
        }
    }
}