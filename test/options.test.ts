import { describe, test, expect, beforeEach } from '@jest/globals'
import { 
  ResourceOptionsManager, 
  resourceOptionsManager, 
  getResourceOptions, 
  setResourceOptions,
  extractResourceOptionsFromRoute,
  validateResourceOptions 
} from '../src/options.js'
import { ResourceOptions, ResourceInfo } from '../src/types.js'

describe('Resource Options', () => {
  beforeEach(() => {
    resourceOptionsManager.clear()
  })

  test('should create and manage resource options', () => {
    const resourceOptions: ResourceOptions = {
      info: {
        name: 'TestResource',
        description: 'A test resource',
        pivot_key: 'test',
        pivot_type: 'Test',
        pivot_description: 'Test description',
        display_name: 'Test Resource',
        mounts: {},
        computed: {}
      }
    }

    setResourceOptions('TestResource', resourceOptions)
    
    const retrieved = getResourceOptions('TestResource')
    expect(retrieved).toEqual(resourceOptions)
    expect(resourceOptionsManager.hasResource('TestResource')).toBe(true)
  })

  test('should extract options from route information', () => {
    const route = {
      'x-nova-resource': {
        info: {
          name: 'CaseResource',
          description: 'Case resource',
          pivot_key: 'case',
          pivot_type: 'Case',
          pivot_description: 'Core case information',
          display_name: null,
          mounts: {
            company: {
              is_resource: true,
              is_foreign: false,
              is_array: false,
              pivot_type: 'ClientCompany',
              pivot_key: 'company',
              info: null,
              relation_type: 'FOR_COMPANY',
              relation_name: 'FOR_COMPANY',
              relation_model: 'Link',
              description: null
            }
          },
          computed: {}
        }
      }
    }

    const extracted = extractResourceOptionsFromRoute(route)
    expect(extracted).toBeTruthy()
    expect(extracted?.info.name).toBe('CaseResource')
    expect(extracted?.info.pivot_key).toBe('case')
    expect(extracted?.info.mounts.company.is_resource).toBe(true)
  })

  test('should validate resource options', () => {
    const validOptions: ResourceOptions = {
      info: {
        name: 'ValidResource',
        description: 'Valid description',
        pivot_key: 'valid',
        pivot_type: 'Valid',
        pivot_description: 'Valid pivot description',
        display_name: 'Valid Display Name',
        mounts: {
          testMount: {
            is_resource: true,
            is_foreign: false,
            is_array: false,
            pivot_type: 'TestType',
            pivot_key: 'test_key',
            info: null,
            relation_type: 'TEST_RELATION',
            relation_name: 'TEST_RELATION',
            relation_model: 'Link',
            description: 'Test mount description'
          }
        },
        computed: {}
      }
    }

    expect(validateResourceOptions(validOptions)).toBe(true)

    const invalidOptions = {
      info: {
        name: 'InvalidResource'
        // Missing required fields
      }
    } as any

    expect(validateResourceOptions(invalidOptions)).toBe(false)
  })

  test('should manage multiple resources', () => {
    const resource1: ResourceOptions = {
      info: {
        name: 'Resource1',
        description: null,
        pivot_key: 'res1',
        pivot_type: 'Resource1',
        pivot_description: null,
        display_name: null,
        mounts: {},
        computed: {}
      }
    }

    const resource2: ResourceOptions = {
      info: {
        name: 'Resource2',
        description: null,
        pivot_key: 'res2',
        pivot_type: 'Resource2',
        pivot_description: null,
        display_name: null,
        mounts: {},
        computed: {}
      }
    }

    setResourceOptions('Resource1', resource1)
    setResourceOptions('Resource2', resource2)

    const names = resourceOptionsManager.getAllResourceNames()
    expect(names).toContain('Resource1')
    expect(names).toContain('Resource2')
    expect(names).toHaveLength(2)
  })

  test('should get resource info and mounts', () => {
    const resourceOptions: ResourceOptions = {
      info: {
        name: 'TestResource',
        description: 'Test description',
        pivot_key: 'test',
        pivot_type: 'Test',
        pivot_description: 'Test pivot description',
        display_name: 'Test Display Name',
        mounts: {
          mount1: {
            is_resource: true,
            is_foreign: false,
            is_array: false,
            pivot_type: 'MountType',
            pivot_key: 'mount_key',
            info: null,
            relation_type: 'MOUNT_RELATION',
            relation_name: 'MOUNT_RELATION',
            relation_model: 'Link',
            description: 'Mount description'
          }
        },
        computed: {}
      }
    }

    setResourceOptions('TestResource', resourceOptions)

    const info = resourceOptionsManager.getResourceInfo('TestResource')
    expect(info?.name).toBe('TestResource')

    const mounts = resourceOptionsManager.getResourceMounts('TestResource')
    expect(mounts?.mount1.is_resource).toBe(true)

    const mount = resourceOptionsManager.getResourceMount('TestResource', 'mount1')
    expect(mount?.pivot_type).toBe('MountType')
  })
})
