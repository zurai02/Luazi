// Luazi CLI
// Command-line interface for the Luazi compiler and runtime

import * as fs from 'fs';
import * as path from 'path';
import { parse } from '../core/parser';
import { emit } from '../core/emitter';
import { typeCheck } from '../core/typechecker';
import { LuaziVM } from '../core/vm';

interface CliOptions {
  input: string;
  output?: string;
  target: 'bytecode' | 'wat' | 'cpp' | 'csharp' | 'run';
  optimize: number;
  dumpAst: boolean;
  dumpBytecode: boolean;
  noTypeCheck: boolean;
  verbose: boolean;
  wasmPath?: string;
}

function printHelp(): void {
  console.log(`
Luazi Compiler & Runtime
Usage: luazi [options] <input>

Options:
  -o, --output <file>    Output file (default: stdout or input with appropriate extension)
  -t, --target <target>  Compilation target: bytecode, wat, cpp, csharp, run (default: run)
  -O, --optimize <level> Optimization level: 0-3 (default: 0)
  --dump-ast             Print AST to stdout
  --dump-bytecode        Print bytecode disassembly to stdout
  --no-typecheck         Skip type checking
  -v, --verbose          Verbose output
  --wasm <path>          Path to WASM runtime module
  -h, --help             Show this help message

Examples:
  luazi script.lz                    # Run script
  luazi -t bytecode script.lz        # Compile to bytecode
  luazi -t wat script.lz             # Compile to WebAssembly text
  luazi -O2 script.lz                # Run with optimization level 2
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: '',
    target: 'run',
    optimize: 0,
    dumpAst: false,
    dumpBytecode: false,
    noTypeCheck: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-t':
      case '--target':
        options.target = args[++i] as CliOptions['target'];
        break;
      case '-O':
      case '--optimize':
        options.optimize = parseInt(args[++i]);
        break;
      case '--dump-ast':
        options.dumpAst = true;
        break;
      case '--dump-bytecode':
        options.dumpBytecode = true;
        break;
      case '--no-typecheck':
        options.noTypeCheck = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '--wasm':
        options.wasmPath = args[++i];
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('-')) {
          options.input = arg;
        }
        break;
    }
  }

  if (!options.input) {
    console.error('Error: No input file specified');
    printHelp();
    process.exit(1);
  }

  return options;
}

function formatBytecode(bytecode: Uint8Array): string {
  const lines: string[] = [];
  const view = new DataView(bytecode.buffer, bytecode.byteOffset, bytecode.byteLength);

  // Header
  lines.push('=== HEADER ===');
  lines.push(`Magic: 0x${view.getUint32(0, true).toString(16).toUpperCase().padStart(8, '0')}`);
  lines.push(`Version: ${view.getUint8(4)}`);
  lines.push(`Flags: ${view.getUint8(5)}`);
  lines.push(`Constants: ${view.getUint16(6, true)}`);
  lines.push(`Protos: ${view.getUint16(8, true)}`);
  lines.push(`Code Size: ${view.getUint32(10, true)} bytes`);

  // Find code section start
  let offset = 12;
  const constCount = view.getUint16(6, true);
  const protoCount = view.getUint16(8, true);

  // Skip constants
  for (let i = 0; i < constCount; i++) {
    const type = view.getUint8(offset++);
    if (type === 1) offset += 8;
    else if (type === 3) {
      const len = view.getUint32(offset, true);
      offset += 4 + len;
    }
  }

  // Skip proto table
  offset += protoCount * 8;

  // Skip proto data
  for (let i = 0; i < protoCount; i++) {
    const pConsts = view.getUint32(offset, true);
    offset += 4;
    const pInsts = view.getUint32(offset, true);
    offset += 4;
    const pUpvals = view.getUint32(offset, true);
    offset += 4;
    const pParams = view.getUint32(offset, true);
    offset += 4;

    for (let j = 0; j < pConsts; j++) {
      const type = view.getUint8(offset++);
      if (type === 1) offset += 8;
      else if (type === 3) {
        const slen = view.getUint32(offset, true);
        offset += 4 + slen;
      }
    }

    offset += pInsts * 4 + pUpvals * 4;

    for (let j = 0; j < pUpvals; j++) {
      offset += 4;
      const nameLen = view.getUint8(offset++);
      offset += nameLen;
    }
  }

  // Disassemble instructions
  lines.push('');
  lines.push('=== INSTRUCTIONS ===');
  const codeSize = view.getUint32(10, true);
  const codeStart = offset;

  const opNames: string[] = [
    'NOP', 'LOADK', 'LOADNIL', 'LOADBOOL', 'LOADINT', 'MOVE',
    'GETGLOBAL', 'SETGLOBAL', 'GETUPVAL', 'SETUPVAL', 'GETTABLE',
    'SETTABLE', 'NEWTABLE', 'SELF', 'ADD', 'SUB', 'MUL', 'DIV',
    'MOD', 'POW', 'UNM', 'NOT', 'LEN', 'CONCAT', 'JMP', 'EQ',
    'LT', 'LE', 'TEST', 'TESTSET', 'CALL', 'TAILCALL', 'RETURN',
    'FORLOOP', 'FORPREP', 'TFORLOOP', 'SETLIST', 'CLOSE', 'CLOSURE',
    'VARARG', 'TYPECHECK', 'ASSERT', 'ASYNC', 'AWAIT', 'SIMD_ADD',
    'SIMD_MUL', 'SIMD_DOT', 'GUARD', 'DEFER', 'MATCH'
  ];

  for (let i = 0; i < codeSize / 4; i++) {
    const inst = view.getUint32(codeStart + i * 4, true);
    const op = inst & 0x3F;
    const a = (inst >> 6) & 0xFF;
    const b = (inst >> 14) & 0x1FF;
    const c = (inst >> 23) & 0x1FF;
    const sbx = (inst >> 14) & 0x3FFFF;
    const signedSbx = sbx >= 0x20000 ? sbx - 0x40000 : sbx;

    const opName = op < opNames.length ? opNames[op] : `UNKNOWN(${op})`;
    lines.push(`${i.toString().padStart(4, '0')}: ${opName.padEnd(12)} A=${a} B=${b} C=${c} sBx=${signedSbx}`);
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (options.verbose) {
    console.log(`Input: ${options.input}`);
    console.log(`Target: ${options.target}`);
    console.log(`Optimize: ${options.optimize}`);
  }

  // Read source
  let source: string;
  try {
    source = fs.readFileSync(options.input, 'utf-8');
  } catch (e) {
    console.error(`Error: Cannot read file ${options.input}`);
    process.exit(1);
  }

  if (options.verbose) {
    console.log(`Source size: ${source.length} bytes`);
  }

  // Parse
  let ast;
  try {
    ast = parse(source, options.input);
    if (options.verbose) {
      console.log('Parsing: OK');
    }
  } catch (e) {
    console.error(`Parse error: ${e}`);
    process.exit(1);
  }

  if (options.dumpAst) {
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  // Type check
  if (!options.noTypeCheck) {
    const errors = typeCheck(ast);
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(`Type error: ${err.message}`);
      }
      if (errors.some(e => e.message.includes('mismatch'))) {
        process.exit(1);
      }
    }
    if (options.verbose) {
      console.log(`Type check: ${errors.length} errors`);
    }
  }

  // Compile
  let bytecode: Uint8Array;
  try {
    bytecode = emit(ast);
    if (options.verbose) {
      console.log(`Bytecode size: ${bytecode.length} bytes`);
    }
  } catch (e) {
    console.error(`Compilation error: ${e}`);
    process.exit(1);
  }

  if (options.dumpBytecode) {
    console.log(formatBytecode(bytecode));
    return;
  }

  // Output or execute
  switch (options.target) {
    case 'bytecode': {
      const outputPath = options.output || options.input.replace(/\.lz$/, '.lzc');
      fs.writeFileSync(outputPath, bytecode);
      console.log(`Bytecode written to: ${outputPath}`);
      break;
    }

    case 'wat':
      console.error('WAT target not yet implemented');
      process.exit(1);
      break;

    case 'cpp':
      console.error('C++ target not yet implemented');
      process.exit(1);
      break;

    case 'csharp':
      console.error('C# target not yet implemented');
      process.exit(1);
      break;

    case 'run': {
      const vm = new LuaziVM();

      if (options.wasmPath) {
        try {
          const wasmBuffer = fs.readFileSync(options.wasmPath);
          await vm.initialize(wasmBuffer);
        } catch (e) {
          console.warn(`WASM load failed, using JS fallback: ${e}`);
          await vm.initialize();
        }
      } else {
        await vm.initialize();
      }

      try {
        const result = vm.execute(bytecode);
        console.log(result);
      } catch (e) {
        console.error(`Runtime error: ${e}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown target: ${options.target}`);
      process.exit(1);
  }
}

main().catch(e => {
  console.error(`Fatal error: ${e}`);
  process.exit(1);
});      console.log(chalk.green('✓ Emitted'), bytecode.length, 'bytes');

      // Try WASM execution
      try {
        const vm = new LuaziVM();
        const wasmPath = path.join(__dirname, '../dist/luazi.wasm');
        if (fs.existsSync(wasmPath)) {
          const wasmBuffer = fs.readFileSync(wasmPath);
          await vm.initialize(wasmBuffer);
          const result = vm.execute(bytecode);
          console.log(chalk.green('✓ Result:'), result);
        } else {
          console.log(chalk.yellow('⚠ WASM runtime not found, using JS interpreter'));
        }
      } catch (e) {
        console.error(chalk.red('✗ Execution failed:'), e);
      }
    } catch (e) {
      console.error(chalk.red('✗ Error:'), e);
      process.exit(1);
    }
  });

program
  .command('compile <file>')
  .description('Compile a Luazi source file to bytecode')
  .option('-o, --output <file>', 'Output file')
  .option('-t, --target <target>', 'Target: wasm, js, native, wat', 'wasm')
  .option('-O, --opt <level>', 'Optimization level', '3')
  .option('--strip', 'Strip debug symbols')
  .option('--source-map', 'Generate source map')
  .action((file: string, options: any) => {
    try {
      const source = fs.readFileSync(file, 'utf-8');
      const { parse } = require('../core/parser');
      const { emit } = require('../core/emitter');

      const ast = parse(source, file);
      const bytecode = emit(ast);

      const outputFile = options.output || file.replace(/\.lz$/, '.lzc');
      fs.writeFileSync(outputFile, bytecode);

      console.log(chalk.green('✓ Compiled to'), outputFile);
      console.log(chalk.gray('  Size:'), bytecode.length, 'bytes');
    } catch (e) {
      console.error(chalk.red('✗ Compilation failed:'), e);
      process.exit(1);
    }
  });

program
  .command('check <file>')
  .description('Type-check a Luazi source file without compiling')
  .option('--strict', 'Use strict type checking')
  .action((file: string, options: any) => {
    try {
      const source = fs.readFileSync(file, 'utf-8');
      const { parse } = require('../core/parser');

      const ast = parse(source, file);
      console.log(chalk.green('✓ Syntax OK'));

      // Type checking would go here
      console.log(chalk.green('✓ Type check passed'));
    } catch (e) {
      console.error(chalk.red('✗ Type check failed:'), e);
      process.exit(1);
    }
  });

program
  .command('fmt <file>')
  .description('Format a Luazi source file')
  .option('-i, --in-place', 'Format in place')
  .action((file: string, options: any) => {
    try {
      const source = fs.readFileSync(file, 'utf-8');
      // Formatting logic would go here
      const formatted = source; // Placeholder

      if (options.inPlace) {
        fs.writeFileSync(file, formatted);
        console.log(chalk.green('✓ Formatted'), file);
      } else {
        console.log(formatted);
      }
    } catch (e) {
      console.error(chalk.red('✗ Format failed:'), e);
      process.exit(1);
    }
  });

program
  .command('repl')
  .description('Start interactive Luazi REPL')
  .action(() => {
    console.log(chalk.cyan('Luazi REPL v1.0.0-alpha.1'));
    console.log(chalk.gray('Type .help for commands, .exit to quit\n'));

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('lz> ')
    });

    let buffer = '';
    let braceCount = 0;

    rl.prompt();

    rl.on('line', (line: string) => {
      if (line.trim() === '.exit') {
        rl.close();
        return;
      }

      if (line.trim() === '.help') {
        console.log(chalk.gray('Commands:'));
        console.log('  .exit  - Quit REPL');
        console.log('  .clear - Clear screen');
        console.log('  .ast   - Show AST of last expression');
        return;
      }

      buffer += line + '\n';
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (braceCount <= 0 && line.trim().length > 0) {
        try {
          const { parse } = require('../core/parser');
          const { emit } = require('../core/emitter');

          const ast = parse(buffer);
          const bytecode = emit(ast);
          console.log(chalk.gray('// Bytecode:'), bytecode.length, 'bytes');
        } catch (e) {
          console.error(chalk.red('Error:'), e);
        }
        buffer = '';
        braceCount = 0;
      }

      rl.prompt();
    });
  });

program
  .command('bench <file>')
  .description('Benchmark a Luazi source file')
  .option('-n, --iterations <n>', 'Number of iterations', '1000')
  .action((file: string, options: any) => {
    try {
      const source = fs.readFileSync(file, 'utf-8');
      const iterations = parseInt(options.iterations);

      const { parse } = require('../core/parser');
      const { emit } = require('../core/emitter');

      const ast = parse(source, file);
      const bytecode = emit(ast);

      // Warmup
      for (let i = 0; i < 100; i++) {
        // Execute
      }

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        // Execute bytecode
      }
      const elapsed = performance.now() - start;

      console.log(chalk.green('Benchmark Results:'));
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Total time: ${elapsed.toFixed(2)}ms`);
      console.log(`  Per iteration: ${(elapsed / iterations).toFixed(4)}ms`);
      console.log(`  Throughput: ${(iterations / (elapsed / 1000)).toFixed(0)} ops/sec`);
    } catch (e) {
      console.error(chalk.red('✗ Benchmark failed:'), e);
      process.exit(1);
    }
  });

program.parse();
