// Luazi Standard Library - File System Module (fs)
// Provides file I/O operations, directory traversal, and path manipulation

export interface FsModule {
  // File operations
  readFile(path: string, encoding?: string): string | Uint8Array;
  writeFile(path: string, data: string | Uint8Array, options?: WriteOptions): void;
  appendFile(path: string, data: string | Uint8Array): void;
  exists(path: string): boolean;
  remove(path: string): void;
  rename(oldPath: string, newPath: string): void;
  copy(src: string, dest: string): void;

  // Directory operations
  mkdir(path: string, recursive?: boolean): void;
  rmdir(path: string, recursive?: boolean): void;
  readdir(path: string): string[];
  readdirSync(path: string): DirEntry[];
  stat(path: string): FileStat;
  lstat(path: string): FileStat;

  // Watch operations
  watch(path: string, callback: WatchCallback): WatchHandle;

  // Path helpers
  cwd(): string;
  chdir(path: string): void;
  tmpdir(): string;
  homedir(): string;
}

export interface WriteOptions {
  encoding?: string;
  mode?: number;
  flag?: string;
}

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: number;
}

export interface FileStat {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  mode: number;
  uid: number;
  gid: number;
  atime: number;
  mtime: number;
  ctime: number;
  birthtime: number;
}

export interface WatchCallback {
  (event: 'change' | 'rename', filename: string): void;
}

export interface WatchHandle {
  close(): void;
}

// ============================================================================
// Node.js Implementation (primary)
// ============================================================================

class NodeFsModule implements FsModule {
  private fs: any;
  private path: any;
  private watcherMap: Map<number, any> = new Map();
  private watcherId: number = 0;

  constructor() {
    try {
      this.fs = require('fs');
      this.path = require('path');
    } catch {
      throw new Error('fs module requires Node.js environment');
    }
  }

  readFile(path: string, encoding?: string): string | Uint8Array {
    if (encoding) {
      return this.fs.readFileSync(path, encoding);
    }
    return new Uint8Array(this.fs.readFileSync(path));
  }

  writeFile(path: string, data: string | Uint8Array, options?: WriteOptions): void {
    const opts: any = { ...options };
    if (data instanceof Uint8Array) {
      this.fs.writeFileSync(path, Buffer.from(data), opts);
    } else {
      this.fs.writeFileSync(path, data, opts);
    }
  }

  appendFile(path: string, data: string | Uint8Array): void {
    if (data instanceof Uint8Array) {
      this.fs.appendFileSync(path, Buffer.from(data));
    } else {
      this.fs.appendFileSync(path, data);
    }
  }

  exists(path: string): boolean {
    return this.fs.existsSync(path);
  }

  remove(path: string): void {
    const stat = this.fs.statSync(path);
    if (stat.isDirectory()) {
      this.fs.rmSync(path, { recursive: true, force: true });
    } else {
      this.fs.unlinkSync(path);
    }
  }

  rename(oldPath: string, newPath: string): void {
    this.fs.renameSync(oldPath, newPath);
  }

  copy(src: string, dest: string): void {
    this.fs.copyFileSync(src, dest);
  }

  mkdir(path: string, recursive?: boolean): void {
    this.fs.mkdirSync(path, { recursive: recursive ?? false });
  }

  rmdir(path: string, recursive?: boolean): void {
    if (recursive) {
      this.fs.rmSync(path, { recursive: true, force: true });
    } else {
      this.fs.rmdirSync(path);
    }
  }

  readdir(path: string): string[] {
    return this.fs.readdirSync(path);
  }

  readdirSync(path: string): DirEntry[] {
    const entries = this.fs.readdirSync(path, { withFileTypes: true });
    return entries.map((entry: any) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink(),
      size: 0,
      mtime: 0
    }));
  }

  stat(path: string): FileStat {
    const s = this.fs.statSync(path);
    return this.toFileStat(s);
  }

  lstat(path: string): FileStat {
    const s = this.fs.lstatSync(path);
    return this.toFileStat(s);
  }

  private toFileStat(s: any): FileStat {
    return {
      size: s.size,
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      isSymlink: s.isSymbolicLink(),
      mode: s.mode,
      uid: s.uid,
      gid: s.gid,
      atime: s.atimeMs,
      mtime: s.mtimeMs,
      ctime: s.ctimeMs,
      birthtime: s.birthtimeMs
    };
  }

  watch(path: string, callback: WatchCallback): WatchHandle {
    const watcher = this.fs.watch(path, (event: string, filename: string) => {
      callback(event as 'change' | 'rename', filename);
    });
    const id = ++this.watcherId;
    this.watcherMap.set(id, watcher);
    return {
      close: () => {
        watcher.close();
        this.watcherMap.delete(id);
      }
    };
  }

  cwd(): string {
    return process.cwd();
  }

  chdir(path: string): void {
    process.chdir(path);
  }

  tmpdir(): string {
    return require('os').tmpdir();
  }

  homedir(): string {
    return require('os').homedir();
  }
}

// ============================================================================
// Browser Implementation (limited)
// ============================================================================

class BrowserFsModule implements FsModule {
  private db: IDBDatabase | null = null;
  private dbName: string = 'luazi-fs';
  private storeName: string = 'files';
  private initialized: boolean = false;

  private async init(): Promise<void> {
    if (this.initialized) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    await this.init();
    const transaction = this.db!.transaction([this.storeName], mode);
    return transaction.objectStore(this.storeName);
  }

  readFile(path: string, encoding?: string): string | Uint8Array {
    throw new Error('Browser fs.readFile is async-only. Use readFileAsync instead.');
  }

  async readFileAsync(path: string, encoding?: string): Promise<string | Uint8Array> {
    const store = await this.getStore('readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(path);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const data = request.result;
        if (data === undefined) {
          reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
        } else if (encoding) {
          resolve(new TextDecoder(encoding).decode(data));
        } else {
          resolve(new Uint8Array(data));
        }
      };
    });
  }

  writeFile(path: string, data: string | Uint8Array, _options?: WriteOptions): void {
    throw new Error('Browser fs.writeFile is async-only. Use writeFileAsync instead.');
  }

  async writeFileAsync(path: string, data: string | Uint8Array, _options?: WriteOptions): Promise<void> {
    const store = await this.getStore('readwrite');
    return new Promise((resolve, reject) => {
      let buffer: ArrayBuffer;
      if (typeof data === 'string') {
        buffer = new TextEncoder().encode(data).buffer;
      } else {
        buffer = data.buffer;
      }
      const request = store.put(buffer, path);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  appendFile(path: string, data: string | Uint8Array): void {
    throw new Error('Browser fs.appendFile not implemented');
  }

  exists(path: string): boolean {
    throw new Error('Browser fs.exists is async-only. Use existsAsync instead.');
  }

  async existsAsync(path: string): Promise<boolean> {
    const store = await this.getStore('readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(path);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result !== undefined);
    });
  }

  remove(path: string): void {
    throw new Error('Browser fs.remove is async-only. Use removeAsync instead.');
  }

  async removeAsync(path: string): Promise<void> {
    const store = await this.getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(path);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  rename(_oldPath: string, _newPath: string): void {
    throw new Error('Browser fs.rename not implemented');
  }

  copy(_src: string, _dest: string): void {
    throw new Error('Browser fs.copy not implemented');
  }

  mkdir(_path: string, _recursive?: boolean): void {
    throw new Error('Browser fs.mkdir not implemented');
  }

  rmdir(_path: string, _recursive?: boolean): void {
    throw new Error('Browser fs.rmdir not implemented');
  }

  readdir(_path: string): string[] {
    throw new Error('Browser fs.readdir is async-only. Use readdirAsync instead.');
  }

  async readdirAsync(_path: string): Promise<string[]> {
    const store = await this.getStore('readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  readdirSync(_path: string): DirEntry[] {
    throw new Error('Browser fs.readdirSync not implemented');
  }

  stat(_path: string): FileStat {
    throw new Error('Browser fs.stat not implemented');
  }

  lstat(_path: string): FileStat {
    throw new Error('Browser fs.lstat not implemented');
  }

  watch(_path: string, _callback: WatchCallback): WatchHandle {
    throw new Error('Browser fs.watch not implemented');
  }

  cwd(): string {
    return '/';
  }

  chdir(_path: string): void {
    throw new Error('Browser fs.chdir not implemented');
  }

  tmpdir(): string {
    return '/tmp';
  }

  homedir(): string {
    return '/home';
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createFsModule(): FsModule {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return new NodeFsModule();
  }
  return new BrowserFsModule();
}

// Singleton
let defaultFs: FsModule | null = null;
export function getFs(): FsModule {
  if (!defaultFs) {
    defaultFs = createFsModule();
  }
  return defaultFs;
}

// Default export for convenience
export default getFs();
