import { defineNuxtModule, addTypeTemplate, createResolver } from '@nuxt/kit'
import { generate } from './generator.js'
import { generateResources } from './resourceGenerator.js'
import { getSchema } from './schemaLoader.js'

// Helper functions for Node.js operations
async function resolvePath(...paths: string[]): Promise<string> {
  const { resolve } = await import('node:path')
  return resolve(...paths)
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  const { existsSync, mkdirSync } = await import('node:fs')
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

async function directoryExists(dirPath: string): Promise<boolean> {
  const { existsSync } = await import('node:fs')
  return existsSync(dirPath)
}

export interface ModuleOptions {
  schemaUrl?: string
  schemaPath?: string
  generateResources?: boolean
  outDir?: string
  watch?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@malevichai/nova-ts',
    configKey: 'novaTs'
  },
  defaults: {
    schemaUrl: '',
    schemaPath: '',
    generateResources: false,
    outDir: 'types/generated',
    watch: true
  },
  async setup(options, nuxt) {
    const { resolve: resolveModule } = createResolver(import.meta.url)
    
    if (!options.schemaUrl && !options.schemaPath) {
      console.warn('[nova-ts] No schema URL or path provided, skipping generation')
      return
    }

    const source = options.schemaUrl || options.schemaPath!
    const outDir = await resolvePath(nuxt.options.rootDir, options.outDir!)

    async function generateTypes() {
      try {
        const schema = await getSchema(source)
        
        if (options.generateResources) {
          await ensureDirectoryExists(outDir)
          
          await generateResources(schema, outDir)
          console.log(`[nova-ts] ✅ Generated resources in ${outDir}`)
          
          nuxt.options.alias['#nova-types/nodes'] = await resolvePath(outDir, 'nodes.ts')
          nuxt.options.alias['#nova-types/resources'] = await resolvePath(outDir, 'resources.ts')
        } else {
          const nodeTypes = await generate(schema)
          
          addTypeTemplate({
            filename: 'nova-types.d.ts',
            getContents: () => nodeTypes,
            write: true
          })
          
          console.log('[nova-ts] ✅ Generated node types')
        }
      } catch (error) {
        console.error('[nova-ts] ❌ Generation failed:', error)
      }
    }

    await generateTypes()

    if (options.watch && nuxt.options.dev) {
      nuxt.hook('builder:watch', async (event, path) => {
        if (options.schemaPath && path === await resolvePath(nuxt.options.rootDir, options.schemaPath)) {
          console.log('[nova-ts] Schema file changed, regenerating types...')
          await generateTypes()
        }
      })

      // Re-generate on dev server restart
      nuxt.hook('ready', async () => {
        if (options.schemaUrl) {
          console.log('[nova-ts] Checking for schema updates...')
          await generateTypes()
        }
      })
    }

    nuxt.hook('imports:dirs', async (dirs) => {
      if (options.generateResources && await directoryExists(outDir)) {
        dirs.push(outDir)
      }
    })

    nuxt.hook('prepare:types', async ({ references }) => {
      if (!options.generateResources) {
        references.push({ path: await resolvePath(nuxt.options.buildDir, 'nova-types.d.ts') })
      }
    })
  }
}) 