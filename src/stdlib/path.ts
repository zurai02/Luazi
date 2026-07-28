// Luazi Standard Library - Path Module
// Cross-platform path manipulation utilities

export interface PathModule {
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  normalize(path: string): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
  parse(path: string): PathObject;
  format(pathObj: PathObject): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
  sep: string;
  delimiter: string;
  posix: PathModule;
  win32: PathModule;
  toNamespacedPath(path: string): string;
  matchesGlob(path: string, pattern: string): boolean;
}

export interface PathObject {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

class PosixPath implements PathModule {
  sep = '/';
  delimiter = ':';
  private _posix: PathModule = this;
  private _win32: PathModule | null = null;

  get posix(): PathModule { return this._posix; }
  get win32(): PathModule {
    if (!this._win32) this._win32 = new Win32Path();
    return this._win32;
  }

  join(...paths: string[]): string {
    if (paths.length === 0) return '.';
    let joined = '';
    for (const segment of paths) {
      if (!segment) continue;
      if (!joined) { joined = segment; }
      else if (joined.endsWith('/') && segment.startsWith('/')) {
        joined += segment.slice(1);
      } else if (!joined.endsWith('/') && !segment.startsWith('/')) {
        joined += '/' + segment;
      } else {
        joined += segment;
      }
    }
    return joined || '.';
  }

  resolve(...paths: string[]): string {
    let resolved = '';
    let isAbsolute = false;
    for (let i = paths.length - 1; i >= 0; i--) {
      const p = paths[i];
      if (!p) continue;
      resolved = p + (resolved ? '/' + resolved : '');
      if (p.startsWith('/')) { isAbsolute = true; break; }
    }
    if (!isAbsolute) resolved = this.join(this.getCwd(), resolved);
    return this.normalize(resolved);
  }

  normalize(path: string): string {
    if (!path) return '.';
    const isAbsolute = path.startsWith('/');
    const trailingSlash = path.endsWith('/') && path.length > 1;
    const parts = path.split('/');
    const normalized: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (normalized.length > 0 && normalized[normalized.length - 1] !== '..') {
          normalized.pop();
        } else if (!isAbsolute) {
          normalized.push('..');
        }
      } else {
        normalized.push(part);
      }
    }
    let result = normalized.join('/');
    if (isAbsolute) result = '/' + result;
    if (trailingSlash && !result.endsWith('/')) result += '/';
    return result || '.';
  }

  dirname(path: string): string {
    if (!path) return '.';
    let end = path.length - 1;
    while (end > 0 && path[end] === '/') end--;
    const lastSlash = path.lastIndexOf('/', end);
    if (lastSlash === -1) return '.';
    if (lastSlash === 0) return '/';
    return path.slice(0, lastSlash);
  }

  basename(path: string, ext?: string): string {
    if (!path) return '';
    let end = path.length;
    while (end > 1 && path[end - 1] === '/') end--;
    const trimmed = path.slice(0, end);
    const lastSlash = trimmed.lastIndexOf('/');
    let base = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
    if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
    return base;
  }

  extname(path: string): string {
    const base = this.basename(path);
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0) return '';
    return base.slice(lastDot);
  }

  parse(path: string): PathObject {
    const root = path.startsWith('/') ? '/' : '';
    const dir = this.dirname(path);
    const base = this.basename(path);
    const ext = this.extname(path);
    const name = base.slice(0, base.length - ext.length);
    return { root, dir, base, ext, name };
  }

  format(pathObj: PathObject): string {
    let path = pathObj.root || '';
    if (pathObj.dir && pathObj.dir !== '.') {
      path += pathObj.dir;
      if (!path.endsWith('/')) path += '/';
    }
    path += pathObj.base || (pathObj.name + pathObj.ext);
    return path;
  }

  isAbsolute(path: string): boolean {
    return path.startsWith('/');
  }

  relative(from: string, to: string): string {
    const fromParts = this.normalize(from).split('/').filter(p => p);
    const toParts = this.normalize(to).split('/').filter(p => p);
    let common = 0;
    while (common < fromParts.length && common < toParts.length &&
           fromParts[common] === toParts[common]) common++;
    const up = fromParts.length - common;
    const result: string[] = [];
    for (let i = 0; i < up; i++) result.push('..');
    for (let i = common; i < toParts.length; i++) result.push(toParts[i]);
    return result.join('/') || '.';
  }

  toNamespacedPath(path: string): string { return path; }

  matchesGlob(path: string, pattern: string): boolean {
    let regex = '^';
    let i = 0;
    while (i < pattern.length) {
      const c = pattern[i];
      if (c === '*') {
        if (i + 1 < pattern.length && pattern[i + 1] === '*') {
          regex += '.*'; i += 2;
        } else { regex += '[^/]*'; i++; }
      } else if (c === '?') { regex += '[^/]'; i++; }
      else if ('\\^$.|+(){}'.includes(c)) { regex += '\\' + c; i++; }
      else { regex += c; i++; }
    }
    return new RegExp(regex + '$').test(path);
  }

  private getCwd(): string {
    return typeof process !== 'undefined' ? process.cwd() : '/';
  }
}

class Win32Path implements PathModule {
  sep = '\\';
  delimiter = ';';
  private _posix: PathModule | null = null;
  private _win32: PathModule = this;

  get posix(): PathModule {
    if (!this._posix) this._posix = new PosixPath();
    return this._posix;
  }
  get win32(): PathModule { return this; }

  join(...paths: string[]): string {
    if (paths.length === 0) return '.';
    let joined = '';
    for (const segment of paths) {
      const s = segment.replace(/\\/g, '/');
      if (!s) continue;
      if (!joined) { joined = s; }
      else if (joined.endsWith('/') && s.startsWith('/')) { joined += s.slice(1); }
      else if (!joined.endsWith('/') && !s.startsWith('/')) { joined += '/' + s; }
      else { joined += s; }
    }
    return joined.replace(/\//g, '\\') || '.';
  }

  resolve(...paths: string[]): string {
    let resolved = '';
    let isAbsolute = false;
    for (let i = paths.length - 1; i >= 0; i--) {
      const p = paths[i].replace(/\\/g, '/');
      if (!p) continue;
      resolved = p + (resolved ? '/' + resolved : '');
      if (this.isAbsolute(p)) { isAbsolute = true; break; }
    }
    if (!isAbsolute) resolved = this.join(this.getCwd().replace(/\\/g, '/'), resolved);
    return this.normalize(resolved);
  }

  normalize(path: string): string {
    path = path.replace(/\\/g, '/');
    if (!path) return '.';
    const isAbsolute = this.isAbsolute(path);
    const trailingSlash = path.endsWith('/') && path.length > 1;
    const parts = path.split('/');
    const normalized: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (normalized.length > 0 && normalized[normalized.length - 1] !== '..') {
          normalized.pop();
        } else if (!isAbsolute) { normalized.push('..'); }
      } else { normalized.push(part); }
    }
    let result = normalized.join('\\');
    if (isAbsolute) {
      const drive = path.match(/^([a-zA-Z]:)/);
      if (drive) result = drive[1] + '\\' + result;
      else if (path.startsWith('//')) result = '\\\\' + result;
    }
    if (trailingSlash && !result.endsWith('\\')) result += '\\';
    return result || '.';
  }

  dirname(path: string): string {
    path = path.replace(/\\/g, '/');
    if (!path) return '.';
    let end = path.length - 1;
    while (end > 0 && path[end] === '/') end--;
    const lastSlash = path.lastIndexOf('/', end);
    if (lastSlash === -1) return '.';
    if (lastSlash === 2 && path[1] === ':') return path.slice(0, 3);
    if (lastSlash === 0) return '/';
    return path.slice(0, lastSlash).replace(/\//g, '\\');
  }

  basename(path: string, ext?: string): string {
    path = path.replace(/\\/g, '/');
    if (!path) return '';
    let end = path.length;
    while (end > 1 && path[end - 1] === '/') end--;
    const trimmed = path.slice(0, end);
    const lastSlash = trimmed.lastIndexOf('/');
    let base = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
    if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
    return base;
  }

  extname(path: string): string {
    const base = this.basename(path);
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0) return '';
    return base.slice(lastDot);
  }

  parse(path: string): PathObject {
    path = path.replace(/\\/g, '/');
    const drive = path.match(/^([a-zA-Z]:)/);
    const root = drive ? drive[1] + '/' : (path.startsWith('/') ? '/' : '');
    const dir = this.dirname(path).replace(/\//g, '\\');
    const base = this.basename(path);
    const ext = this.extname(path);
    const name = base.slice(0, base.length - ext.length);
    return { root, dir, base, ext, name };
  }

  format(pathObj: PathObject): string {
    let path = pathObj.root || '';
    if (pathObj.dir && pathObj.dir !== '.') {
      path += pathObj.dir;
      if (!path.endsWith('\\') && !path.endsWith('/')) path += '\\';
    }
    path += pathObj.base || (pathObj.name + pathObj.ext);
    return path;
  }

  isAbsolute(path: string): boolean {
    return /^([a-zA-Z]:)|^\\\\/.test(path);
  }

  relative(from: string, to: string): string {
    const fromParts = this.normalize(from).replace(/\\/g, '/').split('/').filter(p => p);
    const toParts = this.normalize(to).replace(/\\/g, '/').split('/').filter(p => p);
    let common = 0;
    while (common < fromParts.length && common < toParts.length &&
           fromParts[common].toLowerCase() === toParts[common].toLowerCase()) common++;
    const up = fromParts.length - common;
    const result: string[] = [];
    for (let i = 0; i < up; i++) result.push('..');
    for (let i = common; i < toParts.length; i++) result.push(toParts[i]);
    return result.join('\\') || '.';
  }

  toNamespacedPath(path: string): string {
    if (typeof process !== 'undefined' && process.platform === 'win32') {
      if (path.length >= 2 && path[1] === ':') return '\\?\' + path;
    }
    return path;
  }

  matchesGlob(path: string, pattern: string): boolean {
    return new PosixPath().matchesGlob(path.replace(/\\/g, '/'), pattern.replace(/\\/g, '/'));
  }

  private getCwd(): string {
    return typeof process !== 'undefined' ? process.cwd() : 'C:\\';
  }
}

export function createPathModule(): PathModule {
  if (typeof process !== 'undefined' && process.platform === 'win32') return new Win32Path();
  return new PosixPath();
}

let defaultPath: PathModule | null = null;
export function getPath(): PathModule {
  if (!defaultPath) defaultPath = createPathModule();
  return defaultPath;
}

export default getPath();
