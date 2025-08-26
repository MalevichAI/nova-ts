import { ResourceOptions, ResourceInfo, ResourceMount } from './types.js'

export class ResourceOptionsManager {
    private static instance: ResourceOptionsManager
    private options: Map<string, ResourceOptions> = new Map()

    private constructor() {}

    static getInstance(): ResourceOptionsManager {
        if (!ResourceOptionsManager.instance) {
            ResourceOptionsManager.instance = new ResourceOptionsManager()
        }
        return ResourceOptionsManager.instance
    }

    setResourceOptions(resourceName: string, options: ResourceOptions): void {
        this.options.set(resourceName, options)
    }

    getResourceOptions(resourceName: string): ResourceOptions | undefined {
        return this.options.get(resourceName)
    }

    getResourceInfo(resourceName: string): ResourceInfo | undefined {
        const options = this.getResourceOptions(resourceName)
        return options?.info
    }

    getResourceMounts(resourceName: string): Record<string, ResourceMount> | undefined {
        const info = this.getResourceInfo(resourceName)
        return info?.mounts
    }

    getResourceMount(resourceName: string, mountName: string): ResourceMount | undefined {
        const mounts = this.getResourceMounts(resourceName)
        return mounts?.[mountName]
    }

    getAllResourceNames(): string[] {
        return Array.from(this.options.keys())
    }

    getAllResourceOptions(): Map<string, ResourceOptions> {
        return new Map(this.options)
    }

    hasResource(resourceName: string): boolean {
        return this.options.has(resourceName)
    }

    clear(): void {
        this.options.clear()
    }

    extractOptionsFromRoute(route: any): ResourceOptions | null {
        if (route && route['x-nova-resource']) {
            return route['x-nova-resource'] as ResourceOptions
        }
        return null
    }

    validateResourceOptions(options: ResourceOptions): boolean {
        if (!options.info) return false
        
        const info = options.info
        if (!info.name || !info.pivot_key || !info.pivot_type) return false
        if (typeof info.mounts !== 'object' || info.mounts === null) return false
        if (typeof info.computed !== 'object' || info.computed === null) return false

        for (const [mountName, mount] of Object.entries(info.mounts)) {
            if (!this.validateResourceMount(mount)) return false
        }

        return true
    }

    private validateResourceMount(mount: ResourceMount): boolean {
        return (
            typeof mount.is_resource === 'boolean' &&
            typeof mount.is_foreign === 'boolean' &&
            typeof mount.is_array === 'boolean' &&
            typeof mount.pivot_type === 'string' &&
            typeof mount.relation_type === 'string' &&
            typeof mount.relation_name === 'string' &&
            typeof mount.relation_model === 'string'
        )
    }
}

export const resourceOptionsManager = ResourceOptionsManager.getInstance()

export function getResourceOptions(resourceName: string): ResourceOptions | undefined {
    return resourceOptionsManager.getResourceOptions(resourceName)
}

export function setResourceOptions(resourceName: string, options: ResourceOptions): void {
    resourceOptionsManager.setResourceOptions(resourceName, options)
}

export function extractResourceOptionsFromRoute(route: any): ResourceOptions | null {
    return resourceOptionsManager.extractOptionsFromRoute(route)
}

export function validateResourceOptions(options: ResourceOptions): boolean {
    return resourceOptionsManager.validateResourceOptions(options)
}

