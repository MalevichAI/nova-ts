#!/usr/bin/env node
import { generate } from './generator.js'
import { generateResources, generateFromBothEndpoints } from './resourceGenerator.js'

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
  nova-ts nodes <source> [--out <file>]           Generate node/link types
  nova-ts resources <source> [--out <dir>]         Generate resources with nodes (auto-detects Nova endpoints)
  nova-ts nova-resources <url> [--out <dir>]       Force generation from /resources.json endpoint
  nova-ts nova-nodes <url> [--out <dir>]           Force generation from /nodes.json endpoint  
  nova-ts nova-complete <base-url> [--out <dir>]   Force generation from both Nova endpoints
  nova-ts <source>                                 Generate nodes to stdout (legacy)

Source can be:
  - File path (e.g., ./schema.json)
  - URL (e.g., https://api.example.com/openapi.json)
  - Nova server URL (e.g., http://localhost:8000) - auto-detects /resources.json and /nodes.json
  - Raw JSON string

The 'resources' command automatically detects Nova endpoints and falls back to OpenAPI generation.
Advanced users can force specific endpoints using the nova-* commands.
`)
}

async function main() {
  try {
    if (!command || command === '--help' || command === '-h') {
      await printUsage()
      await exitProcess(0)
    }

    const novaCommands = ['nova-resources', 'nova-nodes', 'nova-complete']
    const isSubCommand = command === 'nodes' || command === 'resources' || novaCommands.includes(command)
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
      await writeToStderr(`✅ Generated types in ${outDir}\n`)
    } else if (command === 'nova-resources') {
      const outDir = outPath ? await resolvePath(outPath) : await getCurrentWorkingDirectory()
      await generateResources(source, outDir)
      await writeToStderr(`✅ Generated options.ts from Nova resources endpoint in ${outDir}\n`)
    } else if (command === 'nova-nodes') {
      const outDir = outPath ? await resolvePath(outPath) : await getCurrentWorkingDirectory()  
      await generateResources(source, outDir)
      await writeToStderr(`✅ Generated nodes.ts from Nova nodes endpoint in ${outDir}\n`)
    } else if (command === 'nova-complete') {
      const outDir = outPath ? await resolvePath(outPath) : await getCurrentWorkingDirectory()
      const baseUrl = source.replace(/\/$/, '') // Remove trailing slash
      const resourcesUrl = `${baseUrl}/resources.json`
      const nodesUrl = `${baseUrl}/nodes.json`
      await generateFromBothEndpoints(resourcesUrl, nodesUrl, outDir)
      await writeToStderr(`✅ Generated complete Nova types in ${outDir}\n`)
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