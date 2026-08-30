// src/core/lua-emitter-bootstrap.ts
// Minimal TS emitter that ONLY knows enough to compile lua-emitter.lz
// After one successful compile, you can delete this file.

import { AST } from './ast';

export function emitLuaBootstrap(program: AST.Program): string {
    const out: string[] = [];
    const indent = (n: number) => '    '.repeat(n);
    let depth = 0;
    
    const write = (s: string) => out.push(indent(depth) + s);
    
    // Only implement what lua-emitter.lz actually uses:
    // - struct declarations
    // - enum declarations  
    // - fn declarations (including methods with self)
    // - let/const/mut → local
    // - match expressions
    // - while loops
    // - for...in loops
    // - string concatenation (+)
    // - array literals, .push()
    // - type() builtin
    // - tostring()
    // - nil checks (!=)
    
    // ... implement just enough ...
    
    return out.join('\n');
}
