#!/usr/bin/env node
import { generate } from './generator.js'
import { generateResources } from './resourceGenerator.js'
import { argv, stderr, stdout, exit } from 'node:process'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'

const [, , command, ...args] = argv

function printUsage() {
  stderr.write(`Usage:
  nova-ts nodes <source> [--out <file>]     Generate node/link types
  nova-ts resources <source> [--out <dir>]   Generate resources with nodes
  nova-ts <source>                           Generate nodes to stdout (legacy)

Source can be:
  - File path (e.g., ./schema.json)
  - URL (e.g., https://api.example.com/openapi.json)
  - Raw JSON string
`)
}

async function main() {
  try {
    if (!command || command === '--help' || command === '-h') {
      printUsage()
      exit(0)
    }

    const isSubCommand = command === 'nodes' || command === 'resources'
    const source = isSubCommand ? args[0] : command
    
    if (!source) {
      printUsage()
      exit(1)
    }

    const outIdx = args.findIndex(a => a === '--out')
    const outPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : null

    if (command === 'resources') {
      const outDir = outPath ? resolve(outPath) : process.cwd()
      await generateResources(source, outDir)
      stderr.write(`✅ Generated nodes.ts and resources.ts in ${outDir}\n`)
    } else if (command === 'nodes') {
      const result = await generate(source)
      if (outPath) {
        const outFile = resolve(outPath)
        writeFileSync(outFile, result, 'utf8')
        stderr.write(`✅ Generated nodes to ${outFile}\n`)
      } else {
        stdout.write(result)
      }
    } else {
      // Legacy mode: generate nodes to stdout
      const result = await generate(source)
      stdout.write(result)
    }
  } catch (error) {
    stderr.write(`❌ Error: ${(error as Error).message}\n`)
    if (process.env.DEBUG) {
      console.error(error)
    }
    exit(1)
  }
}

main() 