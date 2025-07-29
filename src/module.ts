import { defineNuxtModule, addTypeTemplate, createResolver } from '@nuxt/kit'
import { generate } from './generator.js'
import { generateResources } from './resourceGenerator.js'
import { getSchema } from './schemaLoader.js'
import { resolve } from 'node:path'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'

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
    const outDir = resolve(nuxt.options.rootDir, options.outDir!)

    async function generateTypes() {
      try {
        const schema = await getSchema(source)
        
        if (options.generateResources) {
          if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true })
          }
          
          await generateResources(schema, outDir)
          console.log(`[nova-ts] ✅ Generated resources in ${outDir}`)
          
          nuxt.options.alias['#nova-types/nodes'] = resolve(outDir, 'nodes.ts')
          nuxt.options.alias['#nova-types/resources'] = resolve(outDir, 'resources.ts')
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
        if (options.schemaPath && path === resolve(nuxt.options.rootDir, options.schemaPath)) {
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

    nuxt.hook('imports:dirs', (dirs) => {
      if (options.generateResources && existsSync(outDir)) {
        dirs.push(outDir)
      }
    })

    nuxt.hook('prepare:types', ({ references }) => {
      if (!options.generateResources) {
        references.push({ path: resolve(nuxt.options.buildDir, 'nova-types.d.ts') })
      }
    })
  }
}) 