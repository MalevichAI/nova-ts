#!/usr/bin/env node
import { generate } from './generator.js'
import { generateResources } from './resourceGenerator.js'
import { argv, stderr, stdout, exit } from 'node:process'
import { resolve } from 'node:path'

const [, , ...args] = argv

if (args.length === 0) {
  stderr.write('Usage: generate <schema.json|url> [--resources] [--out <dir>]\n')
  exit(1)
}

const schemaInput = args[0]

const isUrl = (v: string) => v.startsWith('http://') || v.startsWith('https://')
const file = isUrl(schemaInput) ? schemaInput : resolve(schemaInput)

const withResources = args.includes('--resources')
const outIdx = args.findIndex(a => a === '--out')
const outDir = outIdx !== -1 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : process.cwd()

async function main() {
  try {
    if (withResources) {
      await generateResources(file, outDir)
      stderr.write(`✅ Generated base.ts, nodes.ts, resources.ts in ${outDir}\n`)
    } else {
      const result = await generate(file)
      stdout.write(result)
    }
  } catch (error) {
    stderr.write(`❌ Error: ${(error as Error).message}\n`)
    exit(1)
  }
}

main() 