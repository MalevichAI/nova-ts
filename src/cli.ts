#!/usr/bin/env node
import { generate } from './generator.js'
import { generateResources } from './resourceGenerator.js'

// Helper functions for Node.js operations
async function getProcessArgs(): Promise<string[]> {
  const { argv } = await import('node:process')
  return argv
}

async function writeToStderr(message: string): Promise<void> {
  const { stderr } = await import('node:process')
  stderr.write(message)
}

async function writeToStdout(message: string): Promise<void> {
  const { stdout } = await import('node:process')
  stdout.write(message)
}

async function exitProcess(code: number): Promise<void> {
  const { exit } = await import('node:process')
  exit(code)
}

async function resolvePath(path: string): Promise<string> {
  const { resolve } = await import('node:path')
  return resolve(path)
}

async function getCurrentWorkingDirectory(): Promise<string> {
  const process = await import('node:process')
  return process.cwd()
}

async function getEnvironmentVariable(name: string): Promise<string | undefined> {
  const process = await import('node:process')
  return process.env[name]
}

async function writeFile(filePath: string, content: string): Promise<void> {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(filePath, content, 'utf8')
}

const argv = await getProcessArgs()
const [, , command, ...args] = argv

async function printUsage() {
  await writeToStderr(`Usage:
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
      await printUsage()
      await exitProcess(0)
    }

    const isSubCommand = command === 'nodes' || command === 'resources'
    const source = isSubCommand ? args[0] : command
    
    if (!source) {
      await printUsage()
      await exitProcess(1)
    }

    const outIdx = args.findIndex(a => a === '--out')
    const outPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : null

    if (command === 'resources') {
      const outDir = outPath ? await resolvePath(outPath) : await getCurrentWorkingDirectory()
      await generateResources(source, outDir)
      await writeToStderr(`✅ Generated nodes.ts and resources.ts in ${outDir}\n`)
    } else if (command === 'nodes') {
      const result = await generate(source)
      if (outPath) {
        const outFile = await resolvePath(outPath)
        await writeFile(outFile, result)
        await writeToStderr(`✅ Generated nodes to ${outFile}\n`)
      } else {
        await writeToStdout(result)
      }
    } else {
      // Legacy mode: generate nodes to stdout
      const result = await generate(source)
      await writeToStdout(result)
    }
  } catch (error) {
    await writeToStderr(`❌ Error: ${(error as Error).message}\n`)
    if (await getEnvironmentVariable('DEBUG')) {
      console.error(error)
    }
    await exitProcess(1)
  }
}

main() 