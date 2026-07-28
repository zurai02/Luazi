// Luazi Standard Library - Process Module
// Process management, environment variables, and system info

export interface ProcessModule {
  // Process info
  pid: number;
  ppid: number;
  platform: string;
  arch: string;
  version: string;
  versions: Record<string, string>;

  // Environment
  env: Record<string, string | undefined>;
  getEnv(key: string): string | undefined;
  setEnv(key: string, value: string): void;
  unsetEnv(key: string): void;

  // Arguments
  argv: string[];
  argv0: string;
  execPath: string;
  execArgv: string[];

  // Working directory
  cwd(): string;
  chdir(directory: string): void;

  // Process control
  exit(code?: number): never;
  abort(): never;
  kill(pid: number, signal?: string | number): boolean;

  // Timing
  uptime(): number;
  hrtime(): [number, number];
  hrtimeBigint(): bigint;
  cpuUsage(previousValue?: CpuUsage): CpuUsage;
  memoryUsage(): MemoryUsage;
  resourceUsage(): ResourceUsage;

  // Events
  on(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;

  // Streams
  stdin: ProcessStream;
  stdout: ProcessStream;
  stderr: ProcessStream;

  // IPC
  send(message: any, sendHandle?: any): boolean;
  disconnect(): void;
  connected: boolean;

  // Next tick
  nextTick(callback: (...args: any[]) => void, ...args: any[]): void;

  // Title
  title: string;

  // Report
  report: ProcessReport;

  // Config
  config: Record<string, any>;

  // Debug port
  debugPort: number;
}

export interface CpuUsage {
  user: number;
  system: number;
}

export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface ResourceUsage {
  userCPUTime: number;
  systemCPUTime: number;
  maxRSS: number;
  sharedMemorySize: number;
  unsharedDataSize: number;
  unsharedStackSize: number;
  minorPageFault: number;
  majorPageFault: number;
  swappedOut: number;
  fsRead: number;
  fsWrite: number;
  ipcSent: number;
  ipcReceived: number;
  signalsCount: number;
  voluntaryContextSwitches: number;
  involuntaryContextSwitches: number;
}

export interface ProcessStream {
  fd: number;
  isTTY: boolean;
  write(chunk: string | Uint8Array, encoding?: string, callback?: (err?: Error) => void): boolean;
  read(size?: number): string | Uint8Array | null;
  on(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
  pause(): void;
  resume(): void;
  setEncoding(encoding: string): void;
}

export interface ProcessReport {
  getReport(): string;
  writeReport(filename?: string, err?: Error): string;
  directory: string;
  filename: string;
  compact: boolean;
  signal: string;
  reportOnFatalError: boolean;
  reportOnSignal: boolean;
  reportOnUncaughtException: boolean;
}

// ============================================================================
// Node.js Implementation
// ============================================================================

class NodeProcessModule implements ProcessModule {
  private nodeProcess: any;
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();

  constructor() {
    this.nodeProcess = process;
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    const events = ['exit', 'beforeExit', 'uncaughtException', 'unhandledRejection', 'SIGINT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2'];
    for (const event of events) {
      this.nodeProcess.on(event, (...args: any[]) => {
        this.emit(event, ...args);
      });
    }
  }

  get pid(): number { return this.nodeProcess.pid; }
  get ppid(): number { return this.nodeProcess.ppid; }
  get platform(): string { return this.nodeProcess.platform; }
  get arch(): string { return this.nodeProcess.arch; }
  get version(): string { return this.nodeProcess.version; }
  get versions(): Record<string, string> { return { ...this.nodeProcess.versions }; }

  get env(): Record<string, string | undefined> { return { ...this.nodeProcess.env }; }
  getEnv(key: string): string | undefined { return this.nodeProcess.env[key]; }
  setEnv(key: string, value: string): void { this.nodeProcess.env[key] = value; }
  unsetEnv(key: string): void { delete this.nodeProcess.env[key]; }

  get argv(): string[] { return [...this.nodeProcess.argv]; }
  get argv0(): string { return this.nodeProcess.argv0; }
  get execPath(): string { return this.nodeProcess.execPath; }
  get execArgv(): string[] { return [...this.nodeProcess.execArgv]; }

  cwd(): string { return this.nodeProcess.cwd(); }
  chdir(directory: string): void { this.nodeProcess.chdir(directory); }

  exit(code?: number): never { this.nodeProcess.exit(code); }
  abort(): never { this.nodeProcess.abort(); }
  kill(pid: number, signal?: string | number): boolean { return this.nodeProcess.kill(pid, signal); }

  uptime(): number { return this.nodeProcess.uptime(); }
  hrtime(): [number, number] { return this.nodeProcess.hrtime(); }
  hrtimeBigint(): bigint { return this.nodeProcess.hrtime.bigint(); }
  cpuUsage(previousValue?: CpuUsage): CpuUsage { return this.nodeProcess.cpuUsage(previousValue); }
  memoryUsage(): MemoryUsage { return this.nodeProcess.memoryUsage(); }
  resourceUsage(): ResourceUsage { return this.nodeProcess.resourceUsage(); }

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(listener);
  }

  once(event: string, listener: (...args: any[]) => void): void {
    const wrapped = (...args: any[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventHandlers.get(event)?.delete(listener);
  }

  emit(event: string, ...args: any[]): boolean {
    const handlers = this.eventHandlers.get(event);
    if (!handlers || handlers.size === 0) return false;
    for (const handler of handlers) {
      try { handler(...args); } catch (e) { console.error(`Error in process event handler: ${e}`); }
    }
    return true;
  }

  get stdin(): ProcessStream { return this.wrapStream(this.nodeProcess.stdin); }
  get stdout(): ProcessStream { return this.wrapStream(this.nodeProcess.stdout); }
  get stderr(): ProcessStream { return this.wrapStream(this.nodeProcess.stderr); }

  private wrapStream(stream: any): ProcessStream {
    return {
      fd: stream.fd,
      isTTY: stream.isTTY ?? false,
      write: (chunk, encoding?, callback?) => stream.write(chunk, encoding, callback),
      read: (size?) => stream.read(size),
      on: (event, listener) => stream.on(event, listener),
      once: (event, listener) => stream.once(event, listener),
      pause: () => stream.pause(),
      resume: () => stream.resume(),
      setEncoding: (encoding) => stream.setEncoding(encoding)
    };
  }

  send(message: any, sendHandle?: any): boolean {
    if (this.nodeProcess.send) {
      return this.nodeProcess.send(message, sendHandle);
    }
    return false;
  }

  disconnect(): void {
    if (this.nodeProcess.disconnect) {
      this.nodeProcess.disconnect();
    }
  }

  get connected(): boolean { return this.nodeProcess.connected ?? false; }

  nextTick(callback: (...args: any[]) => void, ...args: any[]): void {
    this.nodeProcess.nextTick(callback, ...args);
  }

  get title(): string { return this.nodeProcess.title; }
  set title(value: string) { this.nodeProcess.title = value; }

  get report(): ProcessReport {
    return {
      getReport: () => this.nodeProcess.report?.getReport() ?? '{}',
      writeReport: (filename?, err?) => this.nodeProcess.report?.writeReport(filename, err) ?? '',
      directory: this.nodeProcess.report?.directory ?? '',
      filename: this.nodeProcess.report?.filename ?? '',
      compact: this.nodeProcess.report?.compact ?? true,
      signal: this.nodeProcess.report?.signal ?? '',
      reportOnFatalError: this.nodeProcess.report?.reportOnFatalError ?? false,
      reportOnSignal: this.nodeProcess.report?.reportOnSignal ?? false,
      reportOnUncaughtException: this.nodeProcess.report?.reportOnUncaughtException ?? false
    };
  }

  get config(): Record<string, any> { return { ...this.nodeProcess.config }; }
  get debugPort(): number { return this.nodeProcess.debugPort; }
}

// ============================================================================
// Browser Implementation (limited)
// ============================================================================

class BrowserProcessModule implements ProcessModule {
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private _env: Record<string, string> = {};

  get pid(): number { return 0; }
  get ppid(): number { return 0; }
  get platform(): string { return navigator.platform; }
  get arch(): string { return 'unknown'; }
  get version(): string { return 'v0.0.0'; }
  get versions(): Record<string, string> { return { luazi: '0.0.1', v8: 'unknown' }; }

  get env(): Record<string, string | undefined> { return { ...this._env }; }
  getEnv(key: string): string | undefined { return this._env[key]; }
  setEnv(key: string, value: string): void { this._env[key] = value; }
  unsetEnv(key: string): void { delete this._env[key]; }

  get argv(): string[] { return ['browser']; }
  get argv0(): string { return 'browser'; }
  get execPath(): string { return '/browser'; }
  get execArgv(): string[] { return []; }

  cwd(): string { return '/'; }
  chdir(_directory: string): void { throw new Error('process.chdir not available in browser'); }

  exit(code?: number): never {
    if (typeof window !== 'undefined') {
      window.close();
    }
    throw new Error(`Process exited with code ${code ?? 0}`);
  }

  abort(): never { throw new Error('Process aborted'); }
  kill(_pid: number, _signal?: string | number): boolean { return false; }

  uptime(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now() / 1000;
    }
    return 0;
  }

  hrtime(): [number, number] {
    const now = performance.now();
    const seconds = Math.floor(now / 1000);
    const nanos = Math.floor((now % 1000) * 1e6);
    return [seconds, nanos];
  }

  hrtimeBigint(): bigint {
    const [s, n] = this.hrtime();
    return BigInt(s) * BigInt(1e9) + BigInt(n);
  }

  cpuUsage(_previousValue?: CpuUsage): CpuUsage { return { user: 0, system: 0 }; }

  memoryUsage(): MemoryUsage {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      return {
        rss: mem.usedJSHeapSize,
        heapTotal: mem.totalJSHeapSize,
        heapUsed: mem.usedJSHeapSize,
        external: 0,
        arrayBuffers: 0
      };
    }
    return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  }

  resourceUsage(): ResourceUsage {
    return {
      userCPUTime: 0, systemCPUTime: 0, maxRSS: 0, sharedMemorySize: 0,
      unsharedDataSize: 0, unsharedStackSize: 0, minorPageFault: 0,
      majorPageFault: 0, swappedOut: 0, fsRead: 0, fsWrite: 0,
      ipcSent: 0, ipcReceived: 0, signalsCount: 0,
      voluntaryContextSwitches: 0, involuntaryContextSwitches: 0
    };
  }

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(listener);
  }

  once(event: string, listener: (...args: any[]) => void): void {
    const wrapped = (...args: any[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventHandlers.get(event)?.delete(listener);
  }

  emit(event: string, ...args: any[]): boolean {
    const handlers = this.eventHandlers.get(event);
    if (!handlers || handlers.size === 0) return false;
    for (const handler of handlers) {
      try { handler(...args); } catch (e) { console.error(`Error in process event handler: ${e}`); }
    }
    return true;
  }

  get stdin(): ProcessStream { return this.createDummyStream(0); }
  get stdout(): ProcessStream { return this.createDummyStream(1); }
  get stderr(): ProcessStream { return this.createDummyStream(2); }

  private createDummyStream(fd: number): ProcessStream {
    return {
      fd,
      isTTY: false,
      write: (chunk) => { console.log(chunk); return true; },
      read: () => null,
      on: () => {},
      once: () => {},
      pause: () => {},
      resume: () => {},
      setEncoding: () => {}
    };
  }

  send(_message: any, _sendHandle?: any): boolean { return false; }
  disconnect(): void {}
  get connected(): boolean { return false; }

  nextTick(callback: (...args: any[]) => void, ...args: any[]): void {
    Promise.resolve().then(() => callback(...args));
  }

  get title(): string { return document?.title ?? 'browser'; }
  set title(value: string) { if (typeof document !== 'undefined') document.title = value; }

  get report(): ProcessReport {
    return {
      getReport: () => '{}',
      writeReport: () => '',
      directory: '', filename: '', compact: true, signal: '',
      reportOnFatalError: false, reportOnSignal: false, reportOnUncaughtException: false
    };
  }

  get config(): Record<string, any> { return {}; }
  get debugPort(): number { return 0; }
}

// ============================================================================
// Factory
// ============================================================================

export function createProcessModule(): ProcessModule {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return new NodeProcessModule();
  }
  return new BrowserProcessModule();
}

// Singleton
let defaultProcess: ProcessModule | null = null;
export function getProcess(): ProcessModule {
  if (!defaultProcess) {
    defaultProcess = createProcessModule();
  }
  return defaultProcess;
}

// Re-export commonly used functions for convenience
export const env = new Proxy({} as Record<string, string | undefined>, {
  get: (_target, prop: string) => getProcess().getEnv(prop),
  set: (_target, prop: string, value: string) => { getProcess().setEnv(prop, value); return true; },
  deleteProperty: (_target, prop: string) => { getProcess().unsetEnv(prop); return true; },
  ownKeys: () => Object.keys(getProcess().env),
  getOwnPropertyDescriptor: (_target, prop: string) => {
    const val = getProcess().getEnv(prop);
    return val !== undefined ? { value: val, writable: true, enumerable: true, configurable: true } : undefined;
  }
});

export function exit(code?: number): never { return getProcess().exit(code); }
export function cwd(): string { return getProcess().cwd(); }
export function chdir(directory: string): void { getProcess().chdir(directory); }
export function nextTick(callback: (...args: any[]) => void, ...args: any[]): void { getProcess().nextTick(callback, ...args); }

export default getProcess();
