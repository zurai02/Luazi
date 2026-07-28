# Luazi

A modern systems programming language with a TypeScript-based compiler toolchain, targeting multiple runtimes including WebAssembly, C++, and C#.

## Features

- **Multi-target compilation**: Compile to bytecode, WebAssembly (WAT), C++, or C#
- **Type-safe**: Hindley-Milner style type inference with gradual typing
- **Memory-safe**: Ownership and borrowing inspired by Rust
- **Async/await**: First-class asynchronous programming
- **Pattern matching**: Exhaustive match expressions
- **SIMD support**: Vector operations for performance-critical code
- **Zero-cost abstractions**: Compile-time optimizations

## Quick Start

```bash
# Clone the repository
git clone https://github.com/zurai02/Luazi.git
cd Luazi

# Install dependencies
npm install

# Run a script
npx ts-node src/cli/cli.ts examples/hello.lz

# Compile to bytecode
npx ts-node src/cli/cli.ts -t bytecode script.lz

# Dump bytecode disassembly
npx ts-node src/cli/cli.ts --dump-bytecode script.lz
```

## Language Syntax

```luazi
// Variables
let name = "Luazi"
const PI = 3.14159
mut counter = 0

// Functions
fn add(a: number, b: number) -> number {
    return a + b
}

// Async functions
async fn fetchData(url: string) -> string {
    return await httpGet(url)
}

// Structs
struct Point {
    x: number,
    y: number,

    fn distance(other: Point) -> number {
        return sqrt((self.x - other.x)^2 + (self.y - other.y)^2)
    }
}

// Enums
enum Result<T, E> {
    Ok(T),
    Err(E)
}

// Pattern matching
fn handleResult(result: Result<string, Error>) -> string {
    match result {
        Ok(value) => value,
        Err(e) => "Error: " + e.message,
        _ => "Unknown"
    }
}

// Traits
trait Drawable {
    fn draw()
}

impl Drawable for Point {
    fn draw() {
        print("Drawing point")
    }
}

// Guards
fn divide(a: number, b: number) -> number {
    guard b != 0 else {
        return 0
    }
    return a / b
}

// Defer
fn processFile(path: string) {
    let file = open(path)
    defer close(file)
    // ... process file
}
```

## Project Structure

```
Luazi/
├── src/
│   ├── cli/              # Command-line interface
│   │   └── cli.ts
│   ├── core/             # Compiler frontend
│   │   ├── parser.ts     # Recursive descent parser with Pratt parsing
│   │   ├── emitter.ts    # Bytecode emitter
│   │   ├── typechecker.ts # Hindley-Milner type checker
│   │   ├── vm.ts         # VM bindings with JS fallback
│   │   ├── tokenizer.ts  # Lexical analyzer
│   │   ├── ast.ts        # Abstract syntax tree definitions
│   │   └── types.ts      # Type system definitions
│   ├── runtime/          # Runtime implementations
│   │   ├── cpp/          # C++ runtime (WASM-compatible)
│   │   ├── csharp/       # C# runtime
│   │   └── wat/          # WebAssembly text format
│   └── stdlib/           # Standard library modules
│       ├── index.ts      # Module dictionary / registry
│       ├── fs.ts         # File system operations
│       ├── path.ts       # Path manipulation
│       ├── crypto.ts     # Cryptographic primitives
│       └── process.ts    # Process management
├── examples/             # Example programs
└── tests/                # Test suite
```

## Standard Library

Luazi comes with a built-in standard library accessible via the module dictionary:

```luazi
import { modules } from "luazi:stdlib"

// File system
let data = modules.fs.readFile("data.txt")
modules.fs.writeFile("output.txt", "Hello, World!")

// Path manipulation
let fullPath = modules.path.join("src", "core", "parser.ts")
let ext = modules.path.extname("file.txt")  // ".txt"

// Cryptography
let hash = modules.crypto.sha256("password123")
let uuid = modules.crypto.randomUUID()

// Process info
let pid = modules.process.pid
let env = modules.process.env.PATH
```

### Available Modules

| Module | Description | Platforms |
|--------|-------------|-----------|
| `fs` | File system operations (read, write, watch) | Node.js, Browser (IndexedDB) |
| `path` | Cross-platform path manipulation | All |
| `crypto` | Hashing (MD5, SHA1, SHA256), AES, RSA, random | Node.js, Browser (limited) |
| `process` | Process info, environment, streams | Node.js, Browser (limited) |

## CLI Options

```
Usage: luazi [options] <input>

Options:
  -o, --output <file>    Output file
  -t, --target <target>  Compilation target: bytecode, wat, cpp, csharp, run
  -O, --optimize <level> Optimization level: 0-3
  --dump-ast             Print AST to stdout
  --dump-bytecode        Print bytecode disassembly
  --no-typecheck         Skip type checking
  -v, --verbose          Verbose output
  --wasm <path>          Path to WASM runtime module
  -h, --help             Show help
```

## Architecture

```
Source (.lz)
    |
    v
Tokenizer (src/core/tokenizer.ts)
    |
    v
Parser (src/core/parser.ts)
    |
    v
Type Checker (src/core/typechecker.ts)
    |
    v
Emitter (src/core/emitter.ts)
    |
    v
Bytecode (.lzc)
    |
    +---> VM (src/core/vm.ts) - JS fallback interpreter
    |         |
    |         v
    |     WASM Runtime (src/runtime/wat/core.wat)
    |         or
    |     C++ Runtime (src/runtime/cpp/vm.cpp)
    |         or
    |     C# Runtime (src/runtime/csharp/VM.cs)
    |
    +---> Output
```

## Bytecode Format

Luazi uses a Lua-inspired bytecode format with 32-bit instructions:

```
[opcode:6][A:8][B:9][C:9]   -- ABC format
[opcode:6][A:8][Bx:18]      -- ABx format
```

### Opcodes

| Opcode | Name | Description |
|--------|------|-------------|
| 0x00 | NOP | No operation |
| 0x01 | LOADK | Load constant |
| 0x02 | LOADNIL | Load nil |
| 0x03 | LOADBOOL | Load boolean |
| 0x04 | LOADINT | Load integer |
| 0x05 | MOVE | Move register |
| 0x06 | GETGLOBAL | Get global variable |
| 0x07 | SETGLOBAL | Set global variable |
| 0x08 | GETUPVAL | Get upvalue |
| 0x09 | SETUPVAL | Set upvalue |
| 0x0A | GETTABLE | Table lookup |
| 0x0B | SETTABLE | Table store |
| 0x0C | NEWTABLE | Create new table |
| 0x0D | SELF | Method self reference |
| 0x0E | ADD | Addition |
| 0x0F | SUB | Subtraction |
| 0x10 | MUL | Multiplication |
| 0x11 | DIV | Division |
| 0x12 | MOD | Modulo |
| 0x13 | POW | Power |
| 0x14 | UNM | Unary minus |
| 0x15 | NOT | Logical not |
| 0x16 | LEN | Length operator |
| 0x17 | CONCAT | String concatenation |
| 0x18 | JMP | Jump |
| 0x19 | EQ | Equal |
| 0x1A | LT | Less than |
| 0x1B | LE | Less than or equal |
| 0x1C | TEST | Test condition |
| 0x1D | TESTSET | Test and set |
| 0x1E | CALL | Function call |
| 0x1F | TAILCALL | Tail call |
| 0x20 | RETURN | Return from function |
| 0x21 | FORLOOP | Numeric for loop |
| 0x22 | FORPREP | For loop preparation |
| 0x23 | TFORLOOP | Iterator for loop |
| 0x24 | SETLIST | Set list elements |
| 0x25 | CLOSE | Close upvalues |
| 0x26 | CLOSURE | Create closure |
| 0x27 | VARARG | Variable arguments |
| 0x28 | TYPECHECK | Runtime type check |
| 0x29 | ASSERT | Assertion |
| 0x2A | ASYNC | Async marker |
| 0x2B | AWAIT | Await expression |
| 0x2C | SIMD_ADD | SIMD vector addition |
| 0x2D | SIMD_MUL | SIMD vector multiplication |
| 0x2E | SIMD_DOT | SIMD dot product |
| 0x2F | GUARD | Guard statement |
| 0x30 | DEFER | Defer statement |
| 0x31 | MATCH | Pattern match |

## Development

### Building

```bash
# Compile TypeScript
npx tsc

# Run tests
npm test

# Build WASM runtime
wat2wasm src/runtime/wat/core.wat -o dist/luazi.wasm
```

### Contributing

Please read our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by Lua, Rust, TypeScript, and Zig
- Bytecode format based on Lua 5.1
- NaN boxing technique from LuaJIT
