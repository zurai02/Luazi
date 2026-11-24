// Luazi Compiler & Runtime - TypeScript Interface
// Entry point for the Luazi toolchain

export const VERSION = '1.0.0-alpha.2';
export const EXTENSION = '.lzki';
export const FILE_EXTENSION = 'lzki';

export interface VMConfig {
  initialMemory?: number;
  maximumMemory?: number;
  enableJit?: boolean;
}

export class LuaziVM {
  readonly config: VMConfig;

  constructor(config: VMConfig = {}) {
    this.config = config;
  }

  async initialize(_wasmBuffer?: Buffer | Uint8Array): Promise<boolean> {
    return true;
  }

  execute(_bytecode: Uint8Array): number {
    return 0;
  }
}
