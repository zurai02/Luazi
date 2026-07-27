// Luazi VM JavaScript Bindings + Pure-JS Fallback Interpreter
// Loads WASM runtime and provides high-level API with JS fallback

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

// ============================================================================
// PURE JS FALLBACK INTERPRETER
// ============================================================================

enum JSOpCode {
  NOP = 0x00, LOADK = 0x01, LOADNIL = 0x02, LOADBOOL = 0x03, LOADINT = 0x04,
  MOVE = 0x05, GETGLOBAL = 0x06, SETGLOBAL = 0x07, GETUPVAL = 0x08, SETUPVAL = 0x09,
  GETTABLE = 0x0A, SETTABLE = 0x0B, NEWTABLE = 0x0C, SELF = 0x0D,
  ADD = 0x0E, SUB = 0x0F, MUL = 0x10, DIV = 0x11, MOD = 0x12, POW = 0x13,
  UNM = 0x14, NOT = 0x15, LEN = 0x16, CONCAT = 0x17,
  JMP = 0x18, EQ = 0x19, LT = 0x1A, LE = 0x1B, TEST = 0x1C, TESTSET = 0x1D,
  CALL = 0x1E, TAILCALL = 0x1F, RETURN = 0x20,
  FORLOOP = 0x21, FORPREP = 0x22, TFORLOOP = 0x23, SETLIST = 0x24,
  CLOSE = 0x25, CLOSURE = 0x26, VARARG = 0x27,
  TYPECHECK = 0x28, ASSERT = 0x29, ASYNC = 0x2A, AWAIT = 0x2B,
  SIMD_ADD = 0x2C, SIMD_MUL = 0x2D, SIMD_DOT = 0x2E,
  GUARD = 0x2F, DEFER = 0x30, MATCH = 0x31
}

class JSValue {
  constructor(
    public type: 'nil' | 'bool' | 'number' | 'string' | 'table' | 'function',
    public value: any
  ) {}
  static nil() { return new JSValue('nil', null); }
  static bool(v: boolean) { return new JSValue('bool', v); }
  static num(v: number) { return new JSValue('number', v); }
  static str(v: string) { return new JSValue('string', v); }
  static tbl(v: Map<any, JSValue>) { return new JSValue('table', v); }
  static fn(v: Function) { return new JSValue('function', v); }

  isNil() { return this.type === 'nil'; }
  isBool() { return this.type === 'bool'; }
  isNumber() { return this.type === 'number'; }
  isString() { return this.type === 'string'; }
  isTable() { return this.type === 'table'; }
  isFunction() { return this.type === 'function'; }

  asBool(): boolean {
    if (this.isNil()) return false;
    if (this.isBool()) return this.value;
    if (this.isNumber()) return this.value !== 0;
    return true;
  }
  asNumber(): number {
    if (this.isNumber()) return this.value;
    if (this.isString') return parseFloat(this.value);
    return 0;
  }
  asString(): string {
    if (this.isString()) return this.value;
    if (this.isNumber()) return String(this.value);
    if (this.isNil()) return 'nil';
    if (this.isBool()) return this.value ? 'true' : 'false';
    return '[object]';
  }
}

class JSInterpreter {
  private stack: JSValue[] = [];
  private constants: JSValue[] = [];
  private globals: Map<string, JSValue> = new Map();
  private pc: number = 0;
  private fp: number = 0;
  private code: Uint8Array = new Uint8Array(0);
  private protos: any[] = [];

  execute(bytecode: Uint8Array): JSValue {
    this.loadBytecode(bytecode);

    while (this.pc < this.code.length) {
      const inst = this.fetch();
      const op = inst & 0x3F;
      const a = (inst >> 6) & 0xFF;
      const b = (inst >> 14) & 0x1FF;
      const c = (inst >> 23) & 0x1FF;
      const sbx = (inst >> 14) & 0x3FFFF;
      const signedSbx = sbx >= 0x20000 ? sbx - 0x40000 : sbx;

      switch (op) {
        case JSOpCode.NOP: break;
        case JSOpCode.LOADK:
          this.setReg(a, this.constants[b]);
          break;
        case JSOpCode.LOADNIL:
          this.setReg(a, JSValue.nil());
          break;
        case JSOpCode.LOADBOOL:
          this.setReg(a, JSValue.bool(b !== 0));
          if (c !== 0) this.pc += 4;
          break;
        case JSOpCode.LOADINT:
          this.setReg(a, JSValue.num(signedSbx));
          break;
        case JSOpCode.MOVE:
          this.setReg(a, this.getReg(b));
          break;
        case JSOpCode.GETGLOBAL: {
          const name = this.constants[b].asString();
          this.setReg(a, this.globals.get(name) ?? JSValue.nil());
          break;
        }
        case JSOpCode.SETGLOBAL: {
          const name = this.constants[b].asString();
          this.globals.set(name, this.getReg(a));
          break;
        }
        case JSOpCode.GETTABLE: {
          const tbl = this.getReg(b);
          const key = this.getRK(c);
          if (tbl.isTable()) {
            this.setReg(a, tbl.value.get(key.asString()) ?? JSValue.nil());
          } else {
            this.setReg(a, JSValue.nil());
          }
          break;
        }
        case JSOpCode.SETTABLE: {
          const tbl = this.getReg(a);
          const key = this.getRK(b);
          const val = this.getRK(c);
          if (tbl.isTable()) {
            tbl.value.set(key.asString(), val);
          }
          break;
        }
        case JSOpCode.NEWTABLE:
          this.setReg(a, JSValue.tbl(new Map()));
          break;
        case JSOpCode.ADD: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          this.setReg(a, JSValue.num(left + right));
          break;
        }
        case JSOpCode.SUB: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          this.setReg(a, JSValue.num(left - right));
          break;
        }
        case JSOpCode.MUL: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          this.setReg(a, JSValue.num(left * right));
          break;
        }
        case JSOpCode.DIV: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          if (right === 0) throw new Error('Division by zero');
          this.setReg(a, JSValue.num(left / right));
          break;
        }
        case JSOpCode.MOD: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          this.setReg(a, JSValue.num(left % right));
          break;
        }
        case JSOpCode.POW: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          this.setReg(a, JSValue.num(Math.pow(left, right)));
          break;
        }
        case JSOpCode.UNM: {
          const val = this.getReg(b).asNumber();
          this.setReg(a, JSValue.num(-val));
          break;
        }
        case JSOpCode.NOT: {
          const val = this.getReg(b).asBool();
          this.setReg(a, JSValue.bool(!val));
          break;
        }
        case JSOpCode.LEN: {
          const val = this.getReg(b);
          if (val.isString()) {
            this.setReg(a, JSValue.num(val.value.length));
          } else if (val.isTable()) {
            this.setReg(a, JSValue.num(val.value.size));
          } else {
            this.setReg(a, JSValue.num(0));
          }
          break;
        }
        case JSOpCode.CONCAT: {
          let result = '';
          for (let i = b; i <= c; i++) {
            result += this.getReg(i).asString();
          }
          this.setReg(a, JSValue.str(result));
          break;
        }
        case JSOpCode.JMP:
          this.pc += signedSbx * 4;
          break;
        case JSOpCode.EQ: {
          const left = this.getReg(b);
          const right = this.getReg(c);
          const eq = left.type === right.type && left.value === right.value;
          if (eq !== (a !== 0)) this.pc += 4;
          break;
        }
        case JSOpCode.LT: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          if ((left < right) !== (a !== 0)) this.pc += 4;
          break;
        }
        case JSOpCode.LE: {
          const left = this.getReg(b).asNumber();
          const right = this.getReg(c).asNumber();
          if ((left <= right) !== (a !== 0)) this.pc += 4;
          break;
        }
        case JSOpCode.TEST: {
          const val = this.getReg(a).asBool();
          if (val !== (c !== 0)) this.pc += 4;
          break;
        }
        case JSOpCode.TESTSET: {
          const val = this.getReg(b);
          if (val.asBool() === (c !== 0)) {
            this.setReg(a, val);
          } else {
            this.pc += 4;
          }
          break;
        }
        case JSOpCode.CALL: {
          // Simplified: just return nil for now
          this.setReg(a, JSValue.nil());
          break;
        }
        case JSOpCode.TAILCALL: {
          this.setReg(a, JSValue.nil());
          break;
        }
        case JSOpCode.RETURN: {
          if (b === 0) return this.getReg(a);
          if (b === 1) return JSValue.nil();
          return this.getReg(a);
        }
        case JSOpCode.CLOSURE: {
          this.setReg(a, JSValue.fn(() => {}));
          break;
        }
        case JSOpCode.FORLOOP: {
          const idx = this.getReg(a).asNumber() + this.getReg(a + 2).asNumber();
          this.setReg(a, JSValue.num(idx));
          const limit = this.getReg(a + 1).asNumber();
          const step = this.getReg(a + 2).asNumber();
          if ((step > 0 && idx <= limit) || (step < 0 && idx >= limit)) {
            this.pc += signedSbx * 4;
            this.setReg(a + 3, JSValue.num(idx));
          }
          break;
        }
        case JSOpCode.FORPREP: {
          const init = this.getReg(a).asNumber();
          const step = this.getReg(a + 2).asNumber();
          this.setReg(a, JSValue.num(init - step));
          this.pc += signedSbx * 4;
          break;
        }
        case JSOpCode.TYPECHECK: {
          // Simplified type check
          this.setReg(a, JSValue.bool(true));
          break;
        }
        case JSOpCode.AWAIT: {
          this.setReg(a, this.getReg(b));
          break;
        }
        default:
          // Unknown opcode - skip
          break;
      }
    }

    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : JSValue.nil();
  }

  private loadBytecode(bytecode: Uint8Array): void {
    const view = new DataView(bytecode.buffer, bytecode.byteOffset, bytecode.byteLength);
    let offset = 0;

    // Header
    const magic = view.getUint32(offset, true);
    offset += 4;
    const version = view.getUint8(offset++);
    const flags = view.getUint8(offset++);
    const constCount = view.getUint16(offset, true);
    offset += 2;
    const protoCount = view.getUint16(offset, true);
    offset += 2;
    const codeSize = view.getUint32(offset, true);
    offset += 4;

    // Load constants
    this.constants = [];
    for (let i = 0; i < constCount; i++) {
      const type = view.getUint8(offset++);
      switch (type) {
        case 0:
          this.constants.push(JSValue.nil());
          break;
        case 1:
          this.constants.push(JSValue.num(view.getFloat64(offset, true)));
          offset += 8;
          break;
        case 2:
          this.constants.push(JSValue.bool(true));
          break;
        case 3:
          const len = view.getUint32(offset, true);
          offset += 4;
          let str = '';
          for (let j = 0; j < len; j++) {
            str += String.fromCharCode(view.getUint8(offset++));
          }
          this.constants.push(JSValue.str(str));
          break;
      }
    }

    // Skip proto table and proto data for now
    for (let i = 0; i < protoCount; i++) {
      offset += 8; // offset + size
    }

    // Skip proto data
    for (let i = 0; i < protoCount; i++) {
      // Read proto header to skip
      const pConsts = view.getUint32(offset, true);
      offset += 4;
      const pInsts = view.getUint32(offset, true);
      offset += 4;
      const pUpvals = view.getUint32(offset, true);
      offset += 4;
      const pParams = view.getUint32(offset, true);
      offset += 4;

      // Skip proto constants
      for (let j = 0; j < pConsts; j++) {
        const type = view.getUint8(offset++);
        if (type === 1) offset += 8;
        else if (type === 3) {
          const slen = view.getUint32(offset, true);
          offset += 4 + slen;
        }
      }

      offset += pInsts * 4 + pUpvals * 4;

      // Skip upvalue names
      for (let j = 0; j < pUpvals; j++) {
        offset += 4; // index + flags
        const nameLen = view.getUint8(offset++);
        offset += nameLen;
      }
    }

    // Code starts here
    this.code = bytecode.slice(offset, offset + codeSize);
    this.pc = 0;
    this.stack = new Array(256).fill(null).map(() => JSValue.nil());
    this.fp = 0;
  }

  private fetch(): number {
    const inst = new DataView(this.code.buffer, this.code.byteOffset, this.code.byteLength).getUint32(this.pc, true);
    this.pc += 4;
    return inst;
  }

  private getReg(idx: number): JSValue {
    return this.stack[this.fp + idx] ?? JSValue.nil();
  }

  private setReg(idx: number, val: JSValue): void {
    this.stack[this.fp + idx] = val;
  }

  private getRK(idx: number): JSValue {
    if (idx >= 256) {
      return this.constants[idx - 256];
    }
    return this.getReg(idx);
  }
}

// ============================================================================
// WASM VM WRAPPER
// ============================================================================

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
  private jsInterpreter: JSInterpreter | null = null;
  private useJSFallback: boolean = false;

  constructor(config: VMConfig = {}) {
    this.config = {
      memoryPages: 1,
      maxMemoryPages: 8,
      stackSize: 65536,
      enableSIMD: true,
      enableJIT: false,
      ...config
    };
    this.jsInterpreter = new JSInterpreter();
  }

  async initialize(wasmSource?: BufferSource | string): Promise<void> {
    if (!wasmSource) {
      // No WASM provided - use JS fallback
      this.useJSFallback = true;
      return;
    }

    if (typeof wasmSource === 'string') {
      // Load from URL
      try {
        const response = await fetch(wasmSource);
        wasmSource = await response.arrayBuffer();
      } catch (e) {
        console.warn('WASM fetch failed, using JS fallback:', e);
        this.useJSFallback = true;
        return;
      }
    }

    try {
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
          print: (ptr: number, len: number) => {
            const bytes = new Uint8Array(this.memory!.buffer, ptr, len);
            const text = new TextDecoder().decode(bytes);
            console.log(text);
          },
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
    } catch (e) {
      console.warn('WASM initialization failed, using JS fallback:', e);
      this.useJSFallback = true;
    }
  }

  execute(bytecode: Uint8Array): number {
    if (this.useJSFallback || !this.exports.execute) {
      // Use JS fallback interpreter
      const result = this.jsInterpreter!.execute(bytecode);
      if (result.isNumber()) return result.value;
      if (result.isBool()) return result.value ? 1 : 0;
      return 0;
    }

    // Allocate memory for bytecode
    const ptr = this.exports.alloc(bytecode.length);
    const mem = new Uint8Array(this.memory!.buffer);
    mem.set(bytecode, ptr);

    // Execute
    const result = this.exports.execute(ptr, bytecode.length);

    this.stats.instructionsExecuted += bytecode.length / 4;

    return result;
  }

  executeString(source: string): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        const { parse } = require('./parser');
        const { emit } = require('./emitter');

        const ast = parse(source);
        const bytecode = emit(ast);
        resolve(this.execute(bytecode));
      } catch (e) {
        reject(e);
      }
    });
  }

  setGlobal(name: string, value: number): void {
    if (this.useJSFallback) {
      // JS fallback globals
      return;
    }
    if (this.exports.set_global) {
      const encoder = new TextEncoder();
      const nameBytes = encoder.encode(name + '\0');
      const ptr = this.exports.alloc(nameBytes.length);
      new Uint8Array(this.memory!.buffer).set(nameBytes, ptr);
      this.exports.set_global(ptr, value);
    }
  }

  getGlobal(name: string): number {
    if (this.useJSFallback) {
      return 0;
    }
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
    if (this.useJSFallback) {
      // JS fallback has automatic GC
      return;
    }
    if (this.exports.collect_garbage) {
      this.exports.collect_garbage();
      this.stats.gcCollections++;
    }
  }

  getStats(): VMStats {
    if (this.useJSFallback) {
      return { ...this.stats };
    }
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
    if (this.useJSFallback) {
      return new ArrayBuffer(0);
    }
    return this.memory!.buffer;
  }

  readString(ptr: number, len?: number): string {
    if (this.useJSFallback) {
      return '';
    }
    const mem = new Uint8Array(this.memory!.buffer);
    if (len === undefined) {
      let end = ptr;
      while (mem[end] !== 0) end++;
      len = end - ptr;
    }
    return new TextDecoder().decode(mem.subarray(ptr, ptr + len));
  }

  writeString(str: string): number {
    if (this.useJSFallback) {
      return 0;
    }
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
      await defaultVM.initialize();
    }
  }
  return defaultVM;
}

export function run(source: string): Promise<number> {
  return getDefaultVM().then(vm => vm.executeString(source));
      }
