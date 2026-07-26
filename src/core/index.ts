// Luazi - Main Entry Point
// Exports the complete public API

export { tokenize, Token, TokenType } from './core/tokenizer';
export { parse, Parser, ParseError } from './core/parser';
export { emit, BytecodeEmitter, OpCode } from './core/emitter';
export { LuaziVM, VMConfig, VMStats, run } from './core/vm';
export * from './core/ast';

// Version
export const VERSION = '1.0.0-alpha.1';

// Utility function to compile and execute in one step
export async function compileAndRun(source: string, config?: any): Promise<number> {
  const { parse } = await import('./core/parser');
  const { emit } = await import('./core/emitter');
  const { LuaziVM } = await import('./core/vm');

  const ast = parse(source);
  const bytecode = emit(ast);

  const vm = new LuaziVM(config);
  // Try to initialize with WASM if available
  try {
    const fs = await import('fs');
    const path = await import('path');
    const wasmPath = path.join(__dirname, 'luazi.wasm');
    if (fs.existsSync(wasmPath)) {
      const wasmBuffer = fs.readFileSync(wasmPath);
      await vm.initialize(wasmBuffer);
    }
  } catch {
    // WASM not available, will use JS fallback
  }

  return vm.execute(bytecode);
    }
