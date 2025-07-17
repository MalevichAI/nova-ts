# nova-ts

**Type-safe Neo4j OGM helpers, resource utilities and automatic schema-driven type generation for Nova API.**

## Key Features

- Generates complete node and resource TypeScript interfaces directly from your OpenAPI schema
- Powerful filter/request type system with compile-time validation
- Zero-config Nuxt 3 module – point it at your API url and it will autogenerate types on `nuxi dev` and `nuxi build`
- Lightweight, dependency-free runtime helpers

## Nuxt 3 Quick Start

```bash
# Install from GitHub Packages
npm i @malevichai/nova-ts
```

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    [
      '@malevichai/nova-ts',
      {
        apiUrl: 'https://your/api/schema', // OpenAPI JSON url
        outDir: 'types/generated'          // where to write nodes.ts / resources.ts / base.ts
      }
    ]
  ]
})
```

The module fetches the schema, writes the generated types, and registers the folder with Vite so your IDE picks it up instantly.

---

## 🚀 Quick Start

### Installation

```bash
npm install @malevichai/nova-ts
```

**Note:** This package is published to GitHub Packages. You may need to configure npm to use GitHub Packages for the `@malevichai` scope:

```bash
npm config set @malevichai:registry https://npm.pkg.github.com
```

### Basic Usage

Import filter and request types directly from the package:

```typescript
import type {
  ResourceRequest,
  SubresourceRequest,
  ResourceFilter,
  Match,
  Join,
  ResourceEdge,
  Link,
  Resource
} from '@malevichai/nova-ts'

// Generated resource type (from resources.ts)
//                 Pivot type ▾  Pivot key ▾        Additional mounts ▾
export type TaskResource = Resource<Task, 'task', {
  // optional mounts example (uncomment if present in schema)
  // assigned_to: { resource: User; edge: Link; array: false; arrayEdges: true }
}>  

// If your schema only contains the pivot field, the third generic can stay `{}` as above

// Create type-safe requests
const request: ResourceRequest<TaskResource, 'task'> = {
  filter: {
    $filter: {
      $type: 'match',
      $field: 'task.title',
      $value: 'Important',
      $operation: 'CONTAINS'
    }
  },
  subresources: {
    assigned_to: {
      filter: {
        $type: 'match',
        $field: 'name',
        $value: 'John'
      }
    }
  }
}
```

## 🛠️ Generation

### Generate Node Types

```bash
# Using CLI
npx nova-ts generate schema.json > nodes.ts

# Using npm script
npm run generate schema.json > nodes.ts

# Programmatically
import { generate } from 'nova-ts/generator'
const nodeTypes = await generate('./schema.json')
```

### Generate Resource Types

```bash
# Programmatically
import { generateResources } from 'nova-ts/resource-generator'
await generateResources('./schema.json', './generated')
```

This generates:
- `nodes.ts` - Base node interfaces 
- `resources.ts` - Resource interfaces extending `Resource<T, K>`
- `base.ts` - Re-exports from nova-ts

## 📚 Type System

### Core Types

- `Resource<PivotType, PivotKey, Additional>` - Generic resource type (auto-generated)
- `ResourceEdge<S, T>` - Edge between resources
- `ProxyResource<R>` – runtime-friendly representation using `$resource` / `$edges` wrappers
- `CreateResource<R>` / `UpdateResource<R>` – payload shapes for mutations
- `LinkResource<R>` / `UnlinkResource<R>` – edge operations
- `Create<T>` / `Update<T>` – low-level node helpers

#### Example

```ts
import type { ProxyResource, CreateResource, UpdateResource } from '@malevichai/nova-ts'
import type { TaskResource } from '~/types/generated/resources'

// Reading existing data
type TaskProxy = ProxyResource<TaskResource>

// Creating a new task
const newTask: CreateResource<TaskResource> = {
  task: { title: 'Write docs' }
}

// Updating a task
const patch: UpdateResource<TaskResource> = {
  task: { uid: 'task-123', title: 'Write better docs' }
}
```


### Filters

- `Match` - Field equality/comparison
- `MatchEdge` - Edge field matching  
- `Join` - Logical AND/OR operations
- `Exists` - Subresource existence
- `ResourceFilter` / `SubresourceFilter` - Composite filters

### Requests

- `ResourceRequest<T, K>` - Type-safe resource queries
- `SubresourceRequest<T, K>` - Nested resource queries

## 🧪 Testing

```bash
# Run all tests
npm test

# Quick test
npm run test:quick

# Manual testing
node test/test-usage.js
```

## 📖 Examples

### Schema Requirements

Your OpenAPI schema needs OGM metadata:

#### Basic Resource Schema
```json
{
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "properties": {
          "uid": { "type": "string" },
          "name": { "type": "string" }
        },
        "_malevich_ogm_node": {
          "label": "User",
          "name": "User"
        }
      },
      "TaskResource": {
        "type": "object", 
        "properties": {
          "task": { "$ref": "#/components/schemas/Task" }
        },
        "_resource": {
          "type": "proxy"
        }
      }
    }
  }
}
```

#### Enhanced Resource Schema (Recommended)
For better pivot detection, include explicit metadata:

```json
{
  "TaskResource": {
    "type": "object",
    "properties": {
      "task": { "$ref": "#/components/schemas/Task" },
      "assigned_to": { "$ref": "#/components/schemas/ResourceEdge_User_Link_" }
    },
    "_resource": {
      "info": {
        "name": "TaskResource",
        "pivot_key": "task",
        "pivot_type": "Task",
        "mounts": {
          "assigned_to": {
            "is_array": false,
            "is_foreign": false,
            "is_resource": false,
            "pivot_type": "User"
          }
        }
      },
      "type": "proxy"
    }
  }
}
```

**Enhanced Features:**
- ✅ **Explicit Pivot Detection** - Uses `pivot_key` and `pivot_type` from `_resource.info`
- ✅ **Mount Metadata** - Understands relationship types and cardinalities  
- ✅ **Accurate Type Generation** - No more guessing pivot fields
- ✅ **Backwards Compatible** - Falls back to heuristics for basic schemas

### Generated Output

```typescript
// nodes.ts
export interface User {
  uid: string
  name: string
}

// resources.ts  
import type { Resource, ResourceEdge, Link } from '@malevichai/nova-ts'
import type { User, Task } from './nodes'

export interface TaskResource extends Resource<Task, 'task'> {
  task: Task
  assigned_to?: ResourceEdge<User, Link> | null
}
```

## 🔧 Development

```bash
# Build
npm run build

# Run tests
npm test

# Generate from sample
npm run generate test/sample-schema.json
```

## 🔧 Development

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Build the project: `npm run build`
6. Commit your changes: `git commit -am 'Add some feature'`
7. Push to the branch: `git push origin feature/my-feature`
8. Submit a pull request

### Publishing

This package uses automated publishing to GitHub Packages via GitHub Actions:

#### Automated Publishing Process
1. **Automated Releases**: The package uses [release-please](https://github.com/googleapis/release-please) for automated version management
2. **Create Release**: When you merge changes to `main`, release-please will create a release PR
3. **Publish**: When the release PR is merged, a GitHub release is created and the package is automatically published to GitHub Packages

The package is published to GitHub Packages with the scoped name `@malevichai/nova-ts`.

#### Manual Release (if needed)
```bash
# Update version
npm version patch|minor|major

# Create and push tag
git push --follow-tags

# Create GitHub release (triggers publishing)
gh release create v1.0.0 --generate-notes
```

#### Required Secrets
No additional secrets are required! The publishing workflow uses the built-in `GITHUB_TOKEN` which is automatically available in GitHub Actions.

### Available Scripts

- `npm run build` - Build TypeScript to dist/
- `npm test` - Run all tests
- `npm run test:quick` - Run quick functionality test
- `npm run generate` - Run CLI generator
- `npm run prepublishOnly` - Pre-publish checks (build + test)

### CI/CD

The project includes comprehensive GitHub Actions workflows:

- **CI** (`ci.yml`): Runs tests on Node.js 18, 20, and 22 for every push and PR
- **Release Please** (`release.yml`): Automates version management and release creation
- **Publish** (`publish.yml`): Publishes to GitHub Packages on release

## 📝 License

MIT # nova-ts
