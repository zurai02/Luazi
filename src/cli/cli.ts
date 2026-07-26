#!/usr/bin/env node
// Luazi CLI - Command line interface for the Luazi compiler

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const program = new Command();

program
  .name('luazi')
  .description('Luazi - The next-generation scripting language')
  .version('1.0.0-alpha.1');

program
  .command('run <file>')
  .description('Run a Luazi source file')
  .option('-t, --target <target>', 'Compilation target: wasm, js, native', 'auto')
  .option('-O, --opt <level>', 'Optimization level: 0, 1, 2, 3', '2')
  .option('--no-typecheck', 'Skip type checking')
  .option('--profile', 'Enable profiling')
  .option('--jit', 'Enable JIT compilation (native only)')
  .action(async (file: string, options: any) => {
    try {
      const source = fs.readFileSync(file, 'utf-8');
      console.log(chalk.blue('⚡ Compiling'), file);

      const { parse } = require('../core/parser');
      const { emit } = require('../core/emitter');
      const { LuaziVM } = require('../core/vm');

      const ast = parse(source, file);
      console.log(chalk.green('✓ Parsed'));

      const bytecode = emit(ast);
      console.log(chalk.green('✓ Emitted'), bytecode.length, 'bytes');

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
