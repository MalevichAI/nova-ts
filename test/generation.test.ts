import { describe, test, expect } from '@jest/globals'
import { execSync } from 'node:child_process'
import { generate } from '../src/generator.js'
import { generateResources } from '../src/resourceGenerator.js'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('Type Generation', () => {
  test('generated node types should compile without errors', async () => {
    const schemaPath = path.resolve(__dirname, '../openapi.json')
    
    let output: string
    try {
      output = await generate(schemaPath)
    } catch (error) {
      console.error('Generation failed:', error)
      throw new Error(`Failed to generate types: ${error}`)
    }
    
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'nova-ts-'))
    const nodeFile = path.join(dir, 'nodes.ts')
    const tsConfig = path.join(dir, 'tsconfig.json')
    
    await fs.writeFile(nodeFile, output)
    await fs.writeFile(tsConfig, JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        skipLibCheck: true
      }
    }, null, 2))
    
    // Find TypeScript binary path
    const tscPath = path.resolve(__dirname, '../node_modules/.bin/tsc')
    
    try {
      execSync(`${tscPath} --project ${tsConfig}`, { 
        stdio: 'pipe',
        cwd: dir
      })
    } catch (error: any) {
      const stderr = error.stderr?.toString() || ''
      const stdout = error.stdout?.toString() || ''
      console.error('TypeScript compilation failed:')
      console.error('STDERR:', stderr)
      console.error('STDOUT:', stdout)
      
      // Show generated content for debugging
      const content = await fs.readFile(nodeFile, 'utf8')
      console.error('Generated nodes.ts preview:', content.slice(0, 1000))
      
      throw new Error(`TypeScript compilation failed:\n${stderr}\n${stdout}`)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('generated resource types should compile without errors', async () => {
    const schemaPath = path.resolve(__dirname, '../openapi.json')
    
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'nova-ts-'))
    
    try {
      await generateResources(schemaPath, dir)
    } catch (error) {
      console.error('Resource generation failed:', error)
      throw new Error(`Failed to generate resources: ${error}`)
    }
    
    const tsConfig = path.join(dir, 'tsconfig.json')
    const packageJson = path.join(dir, 'package.json')
    const typesFile = path.join(dir, 'types.ts')
    
    // Copy types.ts to the test directory
    const typesSource = await fs.readFile(path.resolve(__dirname, '../src/types.ts'), 'utf8')
    await fs.writeFile(typesFile, typesSource)
    
    await fs.writeFile(tsConfig, JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        skipLibCheck: true,
        paths: {
          '@malevichai/nova-ts': ['./types.ts']
        }
      },
      include: ['*.ts']
    }, null, 2))
    
    await fs.writeFile(packageJson, JSON.stringify({
      name: 'test-package',
      type: 'module'
    }, null, 2))
    
    const tscPath = path.resolve(__dirname, '../node_modules/.bin/tsc')
    
    try {
      execSync(`${tscPath} --project ${tsConfig}`, { 
        stdio: 'pipe',
        cwd: dir
      })
    } catch (error: any) {
      const stderr = error.stderr?.toString() || ''
      const stdout = error.stdout?.toString() || ''
      console.error('TypeScript compilation failed for resources:')
      console.error('STDERR:', stderr)
      console.error('STDOUT:', stdout)
      
      const nodesContent = await fs.readFile(path.join(dir, 'nodes.ts'), 'utf8')
      const resourcesContent = await fs.readFile(path.join(dir, 'resources.ts'), 'utf8')
      console.error('nodes.ts preview:', nodesContent.slice(0, 500))
      console.error('resources.ts preview:', resourcesContent.slice(0, 500))
      
      throw new Error(`TypeScript compilation failed:\n${stderr}\n${stdout}`)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})