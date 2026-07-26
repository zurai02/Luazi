// Luazi VM JavaScript Bindings
// Loads WASM runtime and provides high-level API

export interface VMConfig {
  memoryPages?: number;
  maxMemoryPages?: number;
  stackSize?: number;
  enableSIMD?: boolean;
  enableJIT?: boolean;
}

export interface VMStats {
  memoryUsed: number;
  memoryTotal: number;
  instructionsExecuted: number;
  gcCollections: number;
}

export class LuaziVM {
  private wasmModule: WebAssembly.Module | null = null;
  private wasmInstance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private exports: Record<string, any> = {};
  private config: VMConfig;
  private stats: VMStats = {
    memoryUsed: 0,
    memoryTotal: 0,
    instructionsExecuted: 0,
    gcCollections: 0
  };

  constructor(config: VMConfig = {}) {
    this.config = {
      memoryPages: 1,
      maxMemoryPages: 8,
      stackSize: 65536,
      enableSIMD: true,
      enableJIT: false,
      ...config
    };
  }

  async initialize(wasmSource: BufferSource | string): Promise<void> {
    if (typeof wasmSource === 'string') {
      // Load from URL
      const response = await fetch(wasmSource);
      wasmSource = await response.arrayBuffer();
    }

    this.memory = new WebAssembly.Memory({
      initial: this.config.memoryPages!,
      maximum: this.config.maxMemoryPages!,
      shared: false
    });

    const importObject = {
      env: {
        memory: this.memory,
        __memory_base: 0,
        __table_base: 0,
        abort: () => { throw new Error('WASM abort'); },
        // Math functions
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        pow: Math.pow,
        log: Math.log,
        exp: Math.exp,
        floor: Math.floor,
        ceil: Math.ceil,
        abs: Math.abs,
        // Console output
        print: (ptr: number, len: number) => {
          const bytes = new Uint8Array(this.memory!.buffer, ptr, len);
          const text = new TextDecoder().decode(bytes);
          console.log(text);
        },
        // Time
        now: () => performance.now(),
      },
      wasi_snapshot_preview1: {
        proc_exit: (code: number) => { process.exit(code); },
        fd_write: () => 0,
        fd_close: () => 0,
        fd_seek: () => 0,
        fd_fdstat_get: () => 0,
        path_open: () => 0,
        path_filestat_get: () => 0,
      }
    };

    const { module, instance } = await WebAssembly.instantiate(wasmSource, importObject);
    this.wasmModule = module;
    this.wasmInstance = instance;
    this.exports = instance.exports as Record<string, any>;
  }

  execute(bytecode: Uint8Array): number {
    if (!this.exports.execute) {
      throw new Error('WASM module not initialized or missing execute function');
    }

    // Allocate memory for bytecode
    const ptr = this.exports.alloc(bytecode.length);
    const mem = new Uint8Array(this.memory!.buffer);
    mem.set(bytecode, ptr);

    // Execute
    const result = this.exports.execute(ptr, bytecode.length);

    // Free memory
    // Note: Arena allocator doesn't free individual allocations

    this.stats.instructionsExecuted += bytecode.length / 4;

    return result;
  }

  executeString(source: string): number {
    // Compile and execute
    const { parse } = require('./parser');
    const { emit } = require('./emitter');

    const ast = parse(source);
    const bytecode = emit(ast);
    return this.execute(bytecode);
  }

  setGlobal(name: string, value: number): void {
    if (this.exports.set_global) {
      const encoder = new TextEncoder();
      const nameBytes = encoder.encode(name + '\0');
      const ptr = this.exports.alloc(nameBytes.length);
      new Uint8Array(this.memory!.buffer).set(nameBytes, ptr);
      this.exports.set_global(ptr, value);
    }
  }

  getGlobal(name: string): number {
    if (this.exports.get_global) {
      const encoder = new TextEncoder();
      const nameBytes = encoder.encode(name + '\0');
      const ptr = this.exports.alloc(nameBytes.length);
      new Uint8Array(this.memory!.buffer).set(nameBytes, ptr);
      return this.exports.get_global(ptr);
    }
    return 0;
  }

  collectGarbage(): void {
    if (this.exports.collect_garbage) {
      this.exports.collect_garbage();
      this.stats.gcCollections++;
    }
  }

  getStats(): VMStats {
    if (this.exports.get_memory_stats) {
      const ptr = this.exports.alloc(16);
      this.exports.get_memory_stats(ptr, ptr + 8);
      const view = new DataView(this.memory!.buffer);
      this.stats.memoryUsed = Number(view.getBigUint64(ptr, true));
      this.stats.memoryTotal = Number(view.getBigUint64(ptr + 8, true));
    }
    return { ...this.stats };
  }

  getMemoryBuffer(): ArrayBuffer {
    return this.memory!.buffer;
  }

  readString(ptr: number, len?: number): string {
    const mem = new Uint8Array(this.memory!.buffer);
    if (len === undefined) {
      // Null-terminated
      let end = ptr;
      while (mem[end] !== 0) end++;
      len = end - ptr;
    }
    return new TextDecoder().decode(mem.subarray(ptr, ptr + len));
  }

  writeString(str: string): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str + '\0');
    const ptr = this.exports.alloc(bytes.length);
    new Uint8Array(this.memory!.buffer).set(bytes, ptr);
    return ptr;
  }
}

// Singleton instance
let defaultVM: LuaziVM | null = null;

export async function getDefaultVM(): Promise<LuaziVM> {
  if (!defaultVM) {
    defaultVM = new LuaziVM();
    // Try to load bundled WASM
    try {
      const wasmPath = require.resolve('../dist/luazi.wasm');
      const fs = require('fs');
      const wasmBuffer = fs.readFileSync(wasmPath);
      await defaultVM.initialize(wasmBuffer);
    } catch {
      // WASM not available, use JS fallback
    }
  }
  return defaultVM;
}

export function run(source: string): Promise<number> {
  return getDefaultVM().then(vm => vm.executeString(source));
}
