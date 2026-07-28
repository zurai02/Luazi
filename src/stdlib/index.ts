// Luazi Standard Library - Module Dictionary
// Central registry for all built-in modules

import { FsModule, getFs } from './fs';
import { PathModule, getPath } from './path';
import { CryptoModule, getCrypto } from './crypto';
import { ProcessModule, getProcess } from './process';

// ============================================================================
// Module Registry
// ============================================================================

export interface ModuleRegistry {
  fs: FsModule;
  path: PathModule;
  crypto: CryptoModule;
  process: ProcessModule;
}

// Module metadata for dynamic loading
export interface ModuleInfo {
  name: string;
  version: string;
  description: string;
  exports: string[];
  loaded: boolean;
}

// ============================================================================
// Built-in Module Dictionary
// ============================================================================

const BUILT_IN_MODULES: Record<string, ModuleInfo> = {
  fs: {
    name: 'fs',
    version: '1.0.0',
    description: 'File system operations - read, write, directories, watching',
    exports: [
      'readFile', 'writeFile', 'appendFile', 'exists', 'remove', 'rename', 'copy',
      'mkdir', 'rmdir', 'readdir', 'readdirSync', 'stat', 'lstat',
      'watch', 'cwd', 'chdir', 'tmpdir', 'homedir'
    ],
    loaded: false
  },
  path: {
    name: 'path',
    version: '1.0.0',
    description: 'Cross-platform path manipulation and normalization',
    exports: [
      'join', 'resolve', 'normalize', 'dirname', 'basename', 'extname',
      'parse', 'format', 'isAbsolute', 'relative', 'sep', 'delimiter',
      'posix', 'win32', 'toNamespacedPath', 'matchesGlob'
    ],
    loaded: false
  },
  crypto: {
    name: 'crypto',
    version: '1.0.0',
    description: 'Cryptographic primitives, hashing, and secure random generation',
    exports: [
      'md5', 'sha1', 'sha256', 'sha512', 'hmac', 'pbkdf2',
      'aesEncrypt', 'aesDecrypt', 'generateKeyPair',
      'randomBytes', 'randomUUID', 'randomInt',
      'timingSafeEqual', 'base64Encode', 'base64Decode', 'hexEncode', 'hexDecode'
    ],
    loaded: false
  },
  process: {
    name: 'process',
    version: '1.0.0',
    description: 'Process management, environment variables, and system info',
    exports: [
      'pid', 'ppid', 'platform', 'arch', 'version', 'env',
      'argv', 'argv0', 'execPath', 'cwd', 'chdir',
      'exit', 'abort', 'kill', 'uptime', 'hrtime',
      'cpuUsage', 'memoryUsage', 'resourceUsage',
      'stdin', 'stdout', 'stderr', 'nextTick'
    ],
    loaded: false
  }
};

// ============================================================================
// Module Loader
// ============================================================================

class ModuleLoader {
  private cache: Map<string, any> = new Map();
  private registry: Record<string, ModuleInfo> = { ...BUILT_IN_MODULES };

  /**
   * Check if a module is built-in
   */
  has(name: string): boolean {
    return name in this.registry;
  }

  /**
   * Get module info without loading
   */
  info(name: string): ModuleInfo | undefined {
    return this.registry[name];
  }

  /**
   * List all available modules
   */
  list(): ModuleInfo[] {
    return Object.values(this.registry);
  }

  /**
   * Load a module (with caching)
   */
  load(name: string): any {
    // Return from cache if already loaded
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }

    // Load the module
    let module: any;
    switch (name) {
      case 'fs':
        module = getFs();
        break;
      case 'path':
        module = getPath();
        break;
      case 'crypto':
        module = getCrypto();
        break;
      case 'process':
        module = getProcess();
        break;
      default:
        throw new Error(`Module '${name}' not found in built-in registry`);
    }

    // Cache and mark as loaded
    this.cache.set(name, module);
    if (this.registry[name]) {
      this.registry[name].loaded = true;
    }

    return module;
  }

  /**
   * Load multiple modules at once
   */
  loadMany(names: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const name of names) {
      result[name] = this.load(name);
    }
    return result;
  }

  /**
   * Preload all modules
   */
  preloadAll(): ModuleRegistry {
    return {
      fs: this.load('fs'),
      path: this.load('path'),
      crypto: this.load('crypto'),
      process: this.load('process')
    };
  }

  /**
   * Clear module cache
   */
  clearCache(name?: string): void {
    if (name) {
      this.cache.delete(name);
      if (this.registry[name]) {
        this.registry[name].loaded = false;
      }
    } else {
      this.cache.clear();
      for (const key of Object.keys(this.registry)) {
        this.registry[key].loaded = false;
      }
    }
  }

  /**
   * Register a custom module
   */
  register(name: string, info: ModuleInfo, loader: () => any): void {
    this.registry[name] = info;
    // Override load behavior for custom modules
    const originalLoad = this.load.bind(this);
    this.load = (n: string) => {
      if (n === name) {
        if (!this.cache.has(name)) {
          this.cache.set(name, loader());
          this.registry[name].loaded = true;
        }
        return this.cache.get(name);
      }
      return originalLoad(n);
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const loader = new ModuleLoader();

// Convenience exports
export const modules = {
  /**
   * Get the fs module
   */
  get fs(): FsModule { return loader.load('fs'); },

  /**
   * Get the path module
   */
  get path(): PathModule { return loader.load('path'); },

  /**
   * Get the crypto module
   */
  get crypto(): CryptoModule { return loader.load('crypto'); },

  /**
   * Get the process module
   */
  get process(): ProcessModule { return loader.load('process'); }
};

// Direct module access
export { getFs } from './fs';
export { getPath } from './path';
export { getCrypto } from './crypto';
export { getProcess } from './process';

// Re-export types
export type { FsModule, DirEntry, FileStat, WatchCallback } from './fs';
export type { PathModule, PathObject } from './path';
export type { CryptoModule, EncryptedData, KeyPair } from './crypto';
export type { ProcessModule, CpuUsage, MemoryUsage, ResourceUsage, ProcessStream } from './process';

// Module loader API
export { loader as moduleLoader };
export { BUILT_IN_MODULES };

// Default: preload all modules
export default modules;
