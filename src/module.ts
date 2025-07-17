import { defineNuxtModule } from '@nuxt/kit'
import { generateResources } from './resourceGenerator.js'
import { resolve } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

export * from './index.js'
export default defineNuxtModule({
  meta: {
    name: '@malevichai/nova-ts',
    configKey: 'novaTs'
  },
  defaults: {
    apiUrl: '',
    outDir: 'types/generated'
  },
  async setup(options, nuxt) {
    nuxt.options.build.transpile.push('@malevichai/nova-ts')

    const outDir = resolve(nuxt.options.rootDir, options.outDir)

    const run = async () => {
      if (!options.apiUrl) return
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
      try {
        await generateResources(options.apiUrl, outDir)
      } catch (e) {
        console.error('[nova-ts] generation failed', e)
      }
    }

    await run()
  }
}) 