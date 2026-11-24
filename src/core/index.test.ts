import { VERSION, EXTENSION, FILE_EXTENSION, BYTECODE_EXTENSION, LuaziVM } from './index';

describe('Luazi TypeScript Interface', () => {
  it('exports correct version', () => {
    expect(VERSION).toBe('1.0.0-alpha.2');
  });

  it('uses .lzki file extension', () => {
    expect(EXTENSION).toBe('.lzki');
    expect(FILE_EXTENSION).toBe('lzki');
    expect(BYTECODE_EXTENSION).toBe('.lzkic');
  });

  it('instantiates VM correctly', () => {
    const vm = new LuaziVM();
    expect(vm).toBeInstanceOf(LuaziVM);
  });
});
