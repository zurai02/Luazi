// cli/cli.lz
// Main entry point with full Client Dictionary + Backend + Middleware architecture

import * as fs from 'fs'
import * as path from 'path'
import { Command } from 'commander'
import { CliOptions, Target, LogLevel } from '../shared/types'
import { logger } from '../shared/logger'
import { ClientDictionary, clientDictionary } from '../client/client'
import { Backend, backend } from '../backend/backend'
import { MiddlewareOrchestrator, createOrchestrator } from '../middleware/middleware'
import { LuaziRepl } from '../repl/repl'

const VERSION = '1.0.0-alpha.2'
const PROGRAM_NAME = 'luazi'

struct LuaziCli {
  clientDict: ClientDictionary
  backend: Backend
  orchestrator: MiddlewareOrchestrator
  clientId: string
}

fn newLuaziCli() -> LuaziCli {
  let cd = clientDictionary
  let be = backend
  let orch = createOrchestrator(cd, be)
  let cid = cd.registerClient('cli', VERSION, [
    'compile', 'execute', 'disassemble', 'format', 'benchmark', 'check', 'stats'
  ])
  return LuaziCli {
    clientDict: cd,
    backend: be,
    orchestrator: orch,
    clientId: cid
  }
}

async fn run(self: LuaziCli, args: string[]) -> void {
  let program = new Command()

  program
    .name(PROGRAM_NAME)
    .description('Luazi Compiler & Runtime - Enhanced Edition')
    .version(VERSION, '-v, --version', 'Display version')

  program.option('--no-color', 'Disable colored output')
  program.option('--log-level <level>', 'Log level: debug, info, warn, error', 'info')

  // Run command
  program
    .command('run <file>')
    .description('Run a Luazi source file')
    .option('-O, --optimize <level>', 'Optimization level (0-3)', '0')
    .option('--no-typecheck', 'Skip type checking')
    .option('--wasm <path>', 'Path to WASM runtime module')
    .option('--dump-ast', 'Print AST to stdout')
    .option('--dump-bytecode', 'Print bytecode disassembly')
    .option('--timeout <ms>', 'Execution timeout in ms', '30000')
    .action(async (file: string, options: any) => {
      await self.cmdRun(file, options)
    })

  // Compile command
  program
    .command('compile <file>')
    .description('Compile a Luazi source file')
    .option('-o, --output <file>', 'Output file')
    .option('-t, --target <target>', 'Target: bytecode, wat, cpp, csharp, js', 'bytecode')
    .option('-O, --optimize <level>', 'Optimization level (0-3)', '0')
    .option('--strip', 'Strip debug symbols')
    .option('--source-map', 'Generate source map')
    .option('--dump-ast', 'Print AST')
    .option('--dump-bytecode', 'Print bytecode disassembly')
    .option('--no-typecheck', 'Skip type checking')
    .action(async (file: string, options: any) => {
      await self.cmdCompile(file, options)
    })

  // Execute command
  program
    .command('exec <file>')
    .description('Execute a compiled bytecode file')
    .option('--wasm <path>', 'Path to WASM runtime module')
    .option('--timeout <ms>', 'Execution timeout in ms', '30000')
    .action(async (file: string, options: any) => {
      await self.cmdExecute(file, options)
    })

  // Check command
  program
    .command('check <file>')
    .description('Type-check a Luazi source file without compiling')
    .option('--strict', 'Use strict type checking')
    .action(async (file: string, options: any) => {
      await self.cmdCheck(file, options)
    })

  // Format command
  program
    .command('fmt <file>')
    .description('Format a Luazi source file')
    .option('-i, --in-place', 'Format in place')
    .option('--indent <size>', 'Indent size', '2')
    .option('--tabs', 'Use tabs instead of spaces')
    .action(async (file: string, options: any) => {
      await self.cmdFormat(file, options)
    })

  // Disassemble command
  program
    .command('disasm <file>')
    .description('Disassemble a Luazi bytecode file')
    .option('--no-constants', 'Hide constants table')
    .option('--no-comments', 'Hide instruction comments')
    .action(async (file: string, options: any) => {
      await self.cmdDisassemble(file, options)
    })

  // Benchmark command
  program
    .command('bench <file>')
    .description('Benchmark a Luazi source file')
    .option('-n, --iterations <n>', 'Number of iterations', '1000')
    .option('-O, --optimize <level>', 'Optimization level', '2')
    .action(async (file: string, options: any) => {
      await self.cmdBenchmark(file, options)
    })

  // REPL command
  program
    .command('repl')
    .description('Start interactive Luazi REPL')
    .action(async () => {
      await self.cmdRepl()
    })

  // Stats command
  program
    .command('stats')
    .description('Show backend and client statistics')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
      await self.cmdStats(options)
    })

  // Clean command
  program
    .command('clean')
    .description('Clear compilation cache')
    .action(async () => {
      await self.cmdClean()
    })

  // Init command
  program
    .command('init [name]')
    .description('Initialize a new Luazi project')
    .option('--template <type>', 'Project template: basic, lib, app', 'basic')
    .action(async (name: string = 'my-luazi-project', options: any) => {
      await self.cmdInit(name, options)
    })

  program.parse(args)
}

// ─── Command Implementations ───────────────────────────────────

async fn cmdRun(self: LuaziCli, file: string, options: any) -> void {
  self.configureLogging(options)
  logger.info(`Running: ${file}`)

  try {
    let source = fs.readFileSync(file, 'utf-8')

    let compileResult = await self.orchestrator.handleRequest(self.clientId, 'compile', {
      source: source,
      input: file,
      target: 'run',
      optimize: parseInt(options.optimize) || 0,
      noTypeCheck: options.noTypecheck || false,
      dumpAst: options.dumpAst || false,
      dumpBytecode: options.dumpBytecode || false
    })

    if !compileResult.success {
      logger.failure(`Compilation failed: ${compileResult.error}`)
      process.exit(1)
    }

    if options.dumpAst && compileResult.data?.ast {
      print(JSON.stringify(compileResult.data.ast, null, 2))
      return
    }

    if options.dumpBytecode && compileResult.data?.bytecode {
      let disasmResult = await self.orchestrator.handleRequest(self.clientId, 'disassemble', {
        bytecode: compileResult.data.bytecode
      })
      if disasmResult.success {
        self.printDisassembly(disasmResult.data, true)
      }
      return
    }

    if compileResult.data?.bytecode {
      let execResult = await self.orchestrator.handleRequest(self.clientId, 'execute', {
        bytecode: compileResult.data.bytecode,
        wasmPath: options.wasm,
        timeoutMs: parseInt(options.timeout) || 30000
      })

      if execResult.success {
        if execResult.data?.value != undefined {
          print(execResult.data.value)
        }
        logger.success(`Completed in ${execResult.processingTimeMs.toFixed(2)}ms`)
      } else {
        logger.failure(`Execution failed: ${execResult.error}`)
        process.exit(1)
      }
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdCompile(self: LuaziCli, file: string, options: any) -> void {
  self.configureLogging(options)
  logger.info(`Compiling: ${file} → ${options.target}`)

  try {
    let source = fs.readFileSync(file, 'utf-8')

    let result = await self.orchestrator.handleRequest(self.clientId, 'compile', {
      source: source,
      input: file,
      target: options.target,
      optimize: parseInt(options.optimize) || 0,
      noTypeCheck: options.noTypecheck || false,
      stripDebug: options.strip || false,
      sourceMap: options.sourceMap || false,
      dumpAst: options.dumpAst || false,
      dumpBytecode: options.dumpBytecode || false
    })

    if !result.success {
      logger.failure(`Compilation failed: ${result.error}`)
      process.exit(1)
    }

    if options.dumpAst && result.data?.ast {
      print(JSON.stringify(result.data.ast, null, 2))
      return
    }

    if options.dumpBytecode && result.data?.bytecode {
      let disasmResult = await self.orchestrator.handleRequest(self.clientId, 'disassemble', {
        bytecode: result.data.bytecode
      })
      if disasmResult.success {
        self.printDisassembly(disasmResult.data, true)
      }
      return
    }

    if result.data?.bytecode {
      let outputFile = options.output || file.replace(/\.lz$/, self.getExtension(options.target))
      fs.writeFileSync(outputFile, result.data.bytecode)
      logger.success(`Compiled to ${outputFile}`)

      if result.data.metadata {
        let m = result.data.metadata
        logger.info(`  Source: ${m.sourceSize} bytes → Bytecode: ${m.bytecodeSize} bytes`)
        logger.info(`  Constants: ${m.constantCount} | Instructions: ${m.instructionCount}`)
      }
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdExecute(self: LuaziCli, file: string, options: any) -> void {
  logger.info(`Executing: ${file}`)

  try {
    let bytecode = fs.readFileSync(file)

    let result = await self.orchestrator.handleRequest(self.clientId, 'execute', {
      bytecode: new Uint8Array(bytecode),
      wasmPath: options.wasm,
      timeoutMs: parseInt(options.timeout) || 30000
    })

    if result.success {
      if result.data?.value != undefined {
        print(result.data.value)
      }
      logger.success(`Completed in ${result.processingTimeMs.toFixed(2)}ms`)
    } else {
      logger.failure(`Execution failed: ${result.error}`)
      process.exit(1)
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdCheck(self: LuaziCli, file: string, options: any) -> void {
  logger.info(`Type-checking: ${file}`)

  try {
    let source = fs.readFileSync(file, 'utf-8')

    let result = await self.orchestrator.handleRequest(self.clientId, 'check', {
      source: source,
      input: file
    })

    if result.success {
      logger.success('Type check passed')
      if result.data?.warnings?.length > 0 {
        logger.warn(`${result.data.warnings.length} warning(s)`)
        for w in result.data.warnings {
          print(`  ⚠ ${w.message}`)
        }
      }
    } else {
      logger.failure('Type check failed')
      if result.data?.errors {
        for err in result.data.errors {
          let loc = err.line ? `:${err.line}${err.column ? `:${err.column}` : ''}` : ''
          print(`  ✗ ${err.file || file}${loc} - ${err.message}`)
        }
      }
      process.exit(1)
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdFormat(self: LuaziCli, file: string, options: any) -> void {
  logger.info(`Formatting: ${file}`)

  try {
    let source = fs.readFileSync(file, 'utf-8')

    let result = await self.orchestrator.handleRequest(self.clientId, 'format', {
      source: source,
      indentSize: parseInt(options.indent) || 2,
      useTabs: options.tabs || false
    })

    if result.success && result.data?.formatted {
      if options.inPlace {
        fs.writeFileSync(file, result.data.formatted)
        logger.success(`Formatted ${file} in place`)
      } else {
        print(result.data.formatted)
      }
    } else {
      logger.failure(`Format failed: ${result.error}`)
      process.exit(1)
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdDisassemble(self: LuaziCli, file: string, options: any) -> void {
  logger.info(`Disassembling: ${file}`)

  try {
    let bytecode = fs.readFileSync(file)

    let result = await self.orchestrator.handleRequest(self.clientId, 'disassemble', {
      bytecode: new Uint8Array(bytecode)
    })

    if result.success {
      self.printDisassembly(result.data, options.comments != false, options.constants != false)
    } else {
      logger.failure(`Disassembly failed: ${result.error}`)
      process.exit(1)
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdBenchmark(self: LuaziCli, file: string, options: any) -> void {
  logger.info(`Benchmarking: ${file}`)

  try {
    let source = fs.readFileSync(file, 'utf-8')
    let iterations = parseInt(options.iterations) || 1000

    let result = await self.orchestrator.handleRequest(self.clientId, 'benchmark', {
      source: source,
      input: file,
      iterations: iterations
    })

    if result.success {
      let data = result.data
      logger.group('═══ Benchmark Results ═══')
      print(`  Iterations:    ${data.iterations.toLocaleString()}`)
      print(`  Compile time:  ${data.compileTimeMs.toFixed(2)}ms`)
      print(`  Total time:    ${data.totalTimeMs.toFixed(2)}ms`)
      print(`  Avg/iteration: ${data.avgTimeMs.toFixed(4)}ms`)
      print(`  Throughput:    ${data.throughput.toFixed(0)} ops/sec`)
      print(`  Memory delta:  ${(data.memoryDelta / 1024).toFixed(2)} KB`)
      logger.divider()
    } else {
      logger.failure(`Benchmark failed: ${result.error}`)
      process.exit(1)
    }

  } catch (e: any) {
    logger.failure(`Error: ${e.message}`)
    process.exit(1)
  }
}

async fn cmdRepl(self: LuaziCli) -> void {
  let repl = newLuaziRepl(self.orchestrator, self.clientDict)
  await repl.start()
}

async fn cmdStats(self: LuaziCli, options: any) -> void {
  let result = await self.orchestrator.handleRequest(self.clientId, 'stats', {})

  if result.success {
    if options.json {
      print(JSON.stringify(result.data, null, 2))
    } else {
      logger.group('═══ Backend Statistics ═══')
      print(`  Compilations:    ${result.data.backend.compileCount}`)
      print(`  Errors:          ${result.data.backend.errorCount}`)
      print(`  Cache size:      ${result.data.backend.cacheSize}`)
      print(`  Success rate:    ${result.data.backend.successRate}`)

      logger.group('═══ Client Statistics ═══')
      print(`  Total clients:   ${result.data.clients.totalClients}`)
      print(`  Active clients:  ${result.data.clients.activeClients}`)
      print(`  Queue length:    ${result.data.clients.queueLength}`)
      print(`  Total requests:  ${result.data.clients.totalRequestsHandled}`)
      logger.divider()
    }
  }
}

async fn cmdClean(self: LuaziCli) -> void {
  self.backend.clearCache()
  logger.success('Cache cleared')
}

async fn cmdInit(self: LuaziCli, name: string, options: any) -> void {
  logger.info(`Initializing project: ${name}`)

  let template = options.template
  let dir = path.resolve(name)

  if fs.existsSync(dir) {
    logger.failure(`Directory already exists: ${dir}`)
    process.exit(1)
  }

  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: name,
    version: '0.1.0',
    description: `A Luazi project`,
    main: 'src/main.lz',
    scripts: {
      build: 'luazi compile src/main.lz',
      run: 'luazi run src/main.lz',
      test: 'luazi check tests/*.lz',
      bench: 'luazi bench tests/bench.lz'
    },
    keywords: ['luazi'],
    license: 'MIT'
  }, null, 2))

  let mainContent = template == 'lib'
    ? `// ${name} library

export fn greet(name: string) -> string {
    return "Hello, " + name + "!"
}
`
    : `// ${name}

fn main() {
    print("Hello, Luazi!")
}

main()
`

  fs.writeFileSync(path.join(dir, 'src', 'main.lz'), mainContent)
  fs.writeFileSync(path.join(dir, '.gitignore'), `*.lzc
dist/
node_modules/
`)

  logger.success(`Created ${name} (${template} template)`)
  print(`  cd ${name}`)
  print(`  luazi run src/main.lz`)
}

// ─── Helpers ─────────────────────────────────────────────────────

fn configureLogging(self: LuaziCli, options: any) -> void {
  if options.noColor {
    logger.configure({ colors: false })
  }
  if options.logLevel {
    logger.configure({ level: options.logLevel as LogLevel })
  }
}

fn getExtension(self: LuaziCli, target: string) -> string {
  let extensions: Record<string, string> = {
    bytecode: '.lzc',
    wat: '.wat',
    cpp: '.cpp',
    csharp: '.cs',
    js: '.js'
  }
  return extensions[target] || '.lzc'
}

fn printDisassembly(self: LuaziCli, data: any, showComments: boolean, showConstants: boolean = true) -> void {
  let header = data.header
  let constants = data.constants
  let protos = data.protos
  let instructions = data.instructions

  logger.group('═══ Bytecode Disassembly ═══')
  print(`Magic:     0x${header.magic.toString(16).toUpperCase().padStart(8, '0')}`)
  print(`Version:   ${header.version}`)
  print(`Flags:     ${header.flags}`)
  print(`Constants: ${header.constantCount}`)
  print(`Protos:    ${header.protoCount}`)
  print(`Code Size: ${header.codeSize} bytes`)
  print('')

  if showConstants && constants.length > 0 {
    logger.group('Constants:')
    for c in constants {
      print(`  [${c.index.toString().padStart(3)}] ${c.type.padEnd(7)} ${JSON.stringify(c.value)}`)
    }
    print('')
  }

  if protos.length > 0 {
    logger.group('Protos:')
    for p in protos {
      print(`  [${p.index}] consts=${p.constants} insts=${p.instructions} upvals=${p.upvalues} params=${p.params}`)
    }
    print('')
  }

  logger.group('Instructions:')
  for inst in instructions {
    let comment = showComments && inst.comment ? `  ; ${inst.comment}` : ''
    print(
      `  ${inst.address.toString().padStart(4, '0')}: ` +
      `${inst.opName.padEnd(12)} ` +
      `A=${inst.a.toString().padStart(3)} ` +
      `B=${inst.b.toString().padStart(3)} ` +
      `C=${inst.c.toString().padStart(3)} ` +
      `sBx=${inst.sbx.toString().padStart(6)}` +
      comment
    )
  }
  logger.divider()
}

// ─── Entry Point ─────────────────────────────────────────────────

async fn main() -> void {
  let cli = newLuaziCli()
  await cli.run(process.argv)
}

main().catch(e => {
  logger.failure(`Fatal error: ${e.message || e}`)
  process.exit(1)
})
