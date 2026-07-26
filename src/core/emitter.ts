// Luazi Bytecode Emitter
// Converts AST to compact bytecode for VM execution

import * as AST from './ast';

// Bytecode format:
// Header: magic(4) + version(1) + flags(1) + const_count(2)
// Constants: type(1) + data[]
// Instructions: 32-bit each [opcode:6][A:8][B:9][C:9] or [opcode:6][A:8][Bx:18]

export enum OpCode {
  NOP = 0x00,
  LOADK = 0x01,      // A Bx    R[A] := K[Bx]
  LOADNIL = 0x02,    // A       R[A] := nil
  LOADBOOL = 0x03,   // A B C   R[A] := (B != 0); if C then PC++
  LOADINT = 0x04,    // A sBx   R[A] := sBx
  MOVE = 0x05,       // A B     R[A] := R[B]
  GETGLOBAL = 0x06,  // A Bx    R[A] := G[K[Bx]]
  SETGLOBAL = 0x07,  // A Bx    G[K[Bx]] := R[A]
  GETUPVAL = 0x08,   // A B     R[A] := U[B]
  SETUPVAL = 0x09,   // A B     U[B] := R[A]
  GETTABLE = 0x0A,   // A B C   R[A] := R[B][RK(C)]
  SETTABLE = 0x0B,   // A B C   R[A][RK(B)] := RK(C)
  NEWTABLE = 0x0C,   // A B C   R[A] := {} (size = B,C)
  SELF = 0x0D,       // A B C   R[A+1] := R[B]; R[A] := R[B][RK(C)]
  ADD = 0x0E,        // A B C   R[A] := R[B] + R[C]
  SUB = 0x0F,        // A B C   R[A] := R[B] - R[C]
  MUL = 0x10,        // A B C   R[A] := R[B] * R[C]
  DIV = 0x11,        // A B C   R[A] := R[B] / R[C]
  MOD = 0x12,        // A B C   R[A] := R[B] % R[C]
  POW = 0x13,        // A B C   R[A] := R[B] ^ R[C]
  UNM = 0x14,        // A B     R[A] := -R[B]
  NOT = 0x15,        // A B     R[A] := not R[B]
  LEN = 0x16,        // A B     R[A] := #R[B]
  CONCAT = 0x17,     // A B C   R[A] := R[B] .. ... .. R[C]
  JMP = 0x18,        // sBx     PC += sBx
  EQ = 0x19,         // A B C   if (R[B] == R[C]) ~= A then PC++
  LT = 0x1A,         // A B C   if (R[B] < R[C]) ~= A then PC++
  LE = 0x1B,         // A B C   if (R[B] <= R[C]) ~= A then PC++
  TEST = 0x1C,       // A C     if (R[A] <=> C) then PC++
  TESTSET = 0x1D,    // A B C   if (R[B] <=> C) then R[A] := R[B] else PC++
  CALL = 0x1E,       // A B C   R[A], ... ,R[A+C-2] := R[A](R[A+1], ... ,R[A+B-1])
  TAILCALL = 0x1F,   // A B C   return R[A](R[A+1], ... ,R[A+B-1])
  RETURN = 0x20,     // A B     return R[A], ... ,R[A+B-2]
  FORLOOP = 0x21,    // A sBx   R[A] += R[A+2]; if R[A] <?= R[A+1] then PC += sBx
  FORPREP = 0x22,    // A sBx   R[A] -= R[A+2]; PC += sBx
  TFORLOOP = 0x23,   // A C     R[A+3], ... ,R[A+2+C] := R[A](R[A+1], R[A+2])
  SETLIST = 0x24,    // A B C   R[A][(C-1)*FPF+i] := R[A+i], 1 <= i <= B
  CLOSE = 0x25,      // A       close all variables in the stack up to (>=) R[A]
  CLOSURE = 0x26,    // A Bx    R[A] := closure(KPROTO[Bx])
  VARARG = 0x27,     // A B     R[A], ... ,R[A+B-1] := vararg
  // Luazi extensions
  TYPECHECK = 0x28,  // A B     assert type(R[A]) == B
  ASSERT = 0x29,     // A Bx    assert R[A], message K[Bx]
  ASYNC = 0x2A,      // A       mark R[A] as async function
  AWAIT = 0x2B,     // A B     R[A] := await R[B]
  SIMD_ADD = 0x2C,   // A B C   R[A..A+3] := R[B..B+3] + R[C..C+3]
  SIMD_MUL = 0x2D,   // A B C   R[A..A+3] := R[B..B+3] * R[C..C+3]
  SIMD_DOT = 0x2E,   // A B C   R[A] := dot(R[B..B+3], R[C..C+3])
  GUARD = 0x2F,      // A sBx   if not R[A] then PC += sBx
  DEFER = 0x30,     // A       defer R[A]()
  MATCH = 0x31,     // A B C   match R[A] against pattern table at K[Bx]
}

interface Constant {
  type: 'number' | 'string' | 'bool' | 'nil';
  value: number | string | boolean | null;
}

interface FunctionProto {
  constants: Constant[];
  instructions: number[];
  upvalues: number;
  params: number;
  locals: string[];
  lineInfo: number[];
}

export class BytecodeEmitter {
  private constants: Constant[] = [];
  private instructions: number[] = [];
  private locals: Map<string, number> = new Map();
  private localCount: number = 0;
  private freeReg: number = 0;
  private lineInfo: number[] = [];
  private protos: FunctionProto[] = [];
  private upvalues: string[] = [];

  emit(program: AST.Program): Uint8Array {
    for (const stmt of program.body) {
      this.emitStatement(stmt);
    }
    this.emitInstruction(OpCode.RETURN, 0, 1, 0);

    return this.buildBytecode();
  }

  private buildBytecode(): Uint8Array {
    // Calculate sizes
    const headerSize = 8;
    const constSize = this.constants.reduce((sum, c) => {
      return sum + 1 + (c.type === 'number' ? 8 : c.type === 'string' ? 4 + (c.value as string).length : 1);
    }, 0);
    const codeSize = this.instructions.length * 4;

    const totalSize = headerSize + constSize + codeSize;
    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    let offset = 0;

    // Header
    view.setUint32(offset, 0x4C5A494D, true); // "LZIM" magic
    offset += 4;
    view.setUint8(offset++, 1);  // version
    view.setUint8(offset++, 0); // flags
    view.setUint16(offset, this.constants.length, true);
    offset += 2;

    // Constants
    for (const c of this.constants) {
      switch (c.type) {
        case 'number':
          view.setUint8(offset++, 1);
          view.setFloat64(offset, c.value as number, true);
          offset += 8;
          break;
        case 'string':
          view.setUint8(offset++, 3);
          const str = c.value as string;
          view.setUint32(offset, str.length, true);
          offset += 4;
          for (let i = 0; i < str.length; i++) {
            view.setUint8(offset++, str.charCodeAt(i));
          }
          break;
        case 'bool':
          view.setUint8(offset++, c.value ? 2 : 0);
          break;
        case 'nil':
          view.setUint8(offset++, 0);
          break;
      }
    }

    // Instructions
    for (let i = 0; i < this.instructions.length; i++) {
      view.setUint32(offset + i * 4, this.instructions[i], true);
    }

    return new Uint8Array(buf);
  }

  private emitStatement(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case 'VarDecl':
        this.emitVarDecl(stmt);
        break;
      case 'FnDecl':
        this.emitFnDecl(stmt);
        break;
      case 'If':
        this.emitIf(stmt);
        break;
      case 'While':
        this.emitWhile(stmt);
        break;
      case 'For':
        this.emitFor(stmt);
        break;
      case 'ForIn':
        this.emitForIn(stmt);
        break;
      case 'Match':
        this.emitMatch(stmt);
        break;
      case 'Return':
        this.emitReturn(stmt);
        break;
      case 'Break':
        this.emitBreak(stmt);
        break;
      case 'Continue':
        this.emitContinue(stmt);
        break;
      case 'ExprStmt':
        this.emitExpression(stmt.expression);
        break;
      case 'Block':
        this.emitBlock(stmt);
        break;
      case 'StructDecl':
        this.emitStructDecl(stmt);
        break;
      case 'EnumDecl':
        this.emitEnumDecl(stmt);
        break;
      case 'Import':
        // Imports handled at link time
        break;
      case 'Export':
        this.emitStatement(stmt.declaration);
        break;
      case 'Defer':
        this.emitDefer(stmt);
        break;
      case 'Guard':
        this.emitGuard(stmt);
        break;
      default:
        throw new Error(`Unknown statement kind: ${(stmt as any).kind}`);
    }
  }

  private emitVarDecl(decl: AST.VarDecl): void {
    const reg = this.allocReg();
    this.locals.set(decl.name, reg);

    if (decl.initializer) {
      this.emitExpression(decl.initializer, reg);
    } else {
      this.emitInstruction(OpCode.LOADNIL, reg, 0, 0);
    }
  }

  private emitFnDecl(decl: AST.FnDecl): void {
    const proto = this.emitFunctionProto(decl);
    const reg = this.allocReg();
    const constIdx = this.addConstant({ type: 'nil', value: null }); // Function reference
    this.emitInstruction(OpCode.CLOSURE, reg, constIdx, 0);
    this.locals.set(decl.name, reg);
  }

  private emitFunctionProto(decl: AST.FnDecl): FunctionProto {
    const oldConstants = this.constants;
    const oldInstructions = this.instructions;
    const oldLocals = this.locals;
    const oldLineInfo = this.lineInfo;
    const oldFreeReg = this.freeReg;

    this.constants = [];
    this.instructions = [];
    this.locals = new Map();
    this.lineInfo = [];
    this.freeReg = 0;

    // Register parameters
    for (const param of decl.params) {
      const reg = this.allocReg();
      this.locals.set(param.name, reg);
    }

    // Emit body
    this.emitBlock(decl.body);

    // Ensure return
    if (this.instructions.length === 0 ||
        (this.instructions[this.instructions.length - 1] & 0x3F) !== OpCode.RETURN) {
      this.emitInstruction(OpCode.RETURN, 0, 1, 0);
    }

    const proto: FunctionProto = {
      constants: this.constants,
      instructions: this.instructions,
      upvalues: 0,
      params: decl.params.length,
      locals: Array.from(this.locals.keys()),
      lineInfo: this.lineInfo
    };

    this.constants = oldConstants;
    this.instructions = oldInstructions;
    this.locals = oldLocals;
    this.lineInfo = oldLineInfo;
    this.freeReg = oldFreeReg;

    this.protos.push(proto);
    return proto;
  }

  private emitIf(stmt: AST.IfStmt): void {
    const condReg = this.emitExpression(stmt.condition);

    // Jump to else if condition is false
    const jmpElse = this.instructions.length;
    this.emitInstruction(OpCode.TEST, condReg, 0, 0);
    this.emitInstruction(OpCode.JMP, 0, 0, 0); // Placeholder

    this.emitBlock(stmt.thenBranch);

    if (stmt.elseBranch) {
      const jmpEnd = this.instructions.length;
      this.emitInstruction(OpCode.JMP, 0, 0, 0); // Jump over else

      // Patch else jump
      const elseStart = this.instructions.length;
      this.patchJump(jmpElse + 1, elseStart - jmpElse - 1);

      if (stmt.elseBranch.kind === 'If') {
        this.emitIf(stmt.elseBranch);
      } else {
        this.emitBlock(stmt.elseBranch);
      }

      // Patch end jump
      const endPos = this.instructions.length;
      this.patchJump(jmpEnd, endPos - jmpEnd - 1);
    } else {
      const endPos = this.instructions.length;
      this.patchJump(jmpElse + 1, endPos - jmpElse - 1);
    }

    this.freeReg = condReg;
  }

  private emitWhile(stmt: AST.WhileStmt): void {
    const loopStart = this.instructions.length;
    const condReg = this.emitExpression(stmt.condition);

    const jmpOut = this.instructions.length;
    this.emitInstruction(OpCode.TEST, condReg, 0, 0);
    this.emitInstruction(OpCode.JMP, 0, 0, 0); // Placeholder

    this.emitBlock(stmt.body);

    // Jump back to loop start
    const backJmp = -(this.instructions.length - loopStart + 1);
    this.emitInstruction(OpCode.JMP, 0, backJmp & 0x3FFFF, 0);

    // Patch exit jump
    const endPos = this.instructions.length;
    this.patchJump(jmpOut + 1, endPos - jmpOut - 1);

    this.freeReg = condReg;
  }

  private emitFor(stmt: AST.ForStmt): void {
    if (stmt.init) {
      if (stmt.init.kind === 'VarDecl') {
        this.emitVarDecl(stmt.init);
      } else if (stmt.init.kind === 'ExprStmt') {
        this.emitExpression(stmt.init.expression);
      }
    }

    const loopStart = this.instructions.length;

    if (stmt.condition) {
      const condReg = this.emitExpression(stmt.condition);
      const jmpOut = this.instructions.length;
      this.emitInstruction(OpCode.TEST, condReg, 0, 0);
      this.emitInstruction(OpCode.JMP, 0, 0, 0);

      this.emitBlock(stmt.body);

      if (stmt.increment) {
        this.emitExpression(stmt.increment);
      }

      const backJmp = -(this.instructions.length - loopStart + 1);
      this.emitInstruction(OpCode.JMP, 0, backJmp & 0x3FFFF, 0);

      const endPos = this.instructions.length;
      this.patchJump(jmpOut + 1, endPos - jmpOut - 1);
      this.freeReg = condReg;
    } else {
      this.emitBlock(stmt.body);
      const backJmp = -(this.instructions.length - loopStart + 1);
      this.emitInstruction(OpCode.JMP, 0, backJmp & 0x3FFFF, 0);
    }
  }

  private emitForIn(stmt: AST.ForInStmt): void {
    // Simplified: desugar to while with iterator
    const iterReg = this.emitExpression(stmt.iterable);
    const varReg = this.allocReg();
    this.locals.set(stmt.varName, varReg);

    // Call iterator
    this.emitInstruction(OpCode.CALL, iterReg, 1, 2);
    this.emitInstruction(OpCode.MOVE, varReg, iterReg, 0);
  }

  private emitMatch(stmt: AST.MatchStmt): void {
    const exprReg = this.emitExpression(stmt.expression);
    const endJumps: number[] = [];

    for (const arm of stmt.arms) {
      // Pattern matching - simplified
      const patternReg = this.emitPattern(arm.pattern, exprReg);
      const jmpNext = this.instructions.length;
      this.emitInstruction(OpCode.TEST, patternReg, 0, 0);
      this.emitInstruction(OpCode.JMP, 0, 0, 0);

      if (arm.body.kind === 'Block') {
        this.emitBlock(arm.body);
      } else {
        const bodyReg = this.emitExpression(arm.body as AST.Expression);
      }

      const jmpEnd = this.instructions.length;
      this.emitInstruction(OpCode.JMP, 0, 0, 0);
      endJumps.push(jmpEnd);

      // Patch next jump
      const nextPos = this.instructions.length;
      this.patchJump(jmpNext + 1, nextPos - jmpNext - 1);
    }

    // Patch all end jumps
    const finalPos = this.instructions.length;
    for (const jmp of endJumps) {
      this.patchJump(jmp, finalPos - jmp - 1);
    }

    this.freeReg = exprReg;
  }

  private emitPattern(pattern: AST.Pattern, valueReg: number): number {
    const resultReg = this.allocReg();

    switch (pattern.kind) {
      case 'LiteralPattern':
        const lit = pattern.value;
        const litReg = this.allocReg();
        if (typeof lit.value === 'number') {
          this.emitInstruction(OpCode.LOADINT, litReg, lit.value as number, 0);
        } else if (typeof lit.value === 'string') {
          const idx = this.addConstant({ type: 'string', value: lit.value });
          this.emitInstruction(OpCode.LOADK, litReg, idx, 0);
        } else if (typeof lit.value === 'boolean') {
          this.emitInstruction(OpCode.LOADBOOL, litReg, lit.value ? 1 : 0, 0);
        }
        this.emitInstruction(OpCode.EQ, 1, valueReg, litReg);
        this.emitInstruction(OpCode.LOADBOOL, resultReg, 1, 0);
        break;

      case 'WildcardPattern':
        this.emitInstruction(OpCode.LOADBOOL, resultReg, 1, 0);
        break;

      case 'VariablePattern':
        this.locals.set(pattern.name, valueReg);
        this.emitInstruction(OpCode.LOADBOOL, resultReg, 1, 0);
        break;

      default:
        this.emitInstruction(OpCode.LOADBOOL, resultReg, 1, 0);
    }

    return resultReg;
  }

  private emitReturn(stmt: AST.ReturnStmt): void {
    if (stmt.value) {
      const reg = this.emitExpression(stmt.value);
      this.emitInstruction(OpCode.RETURN, reg, 2, 0);
    } else {
      this.emitInstruction(OpCode.RETURN, 0, 1, 0);
    }
  }

  private emitBreak(_stmt: AST.BreakStmt): void {
    // TODO: Track loop depth and emit proper jump
    this.emitInstruction(OpCode.JMP, 0, 0, 0);
  }

  private emitContinue(_stmt: AST.ContinueStmt): void {
    this.emitInstruction(OpCode.JMP, 0, 0, 0);
  }

  private emitBlock(block: AST.Block): void {
    const oldLocals = new Map(this.locals);
    const oldFreeReg = this.freeReg;

    for (const stmt of block.statements) {
      this.emitStatement(stmt);
    }

    this.locals = oldLocals;
    this.freeReg = oldFreeReg;
  }

  private emitStructDecl(_decl: AST.StructDecl): void {
    // Structs are type information, emitted as metadata
  }

  private emitEnumDecl(_decl: AST.EnumDecl): void {
    // Enums are type information
  }

  private emitDefer(stmt: AST.DeferStmt): void {
    const reg = this.emitExpression(stmt.expression);
    this.emitInstruction(OpCode.DEFER, reg, 0, 0);
  }

  private emitGuard(stmt: AST.GuardStmt): void {
    const condReg = this.emitExpression(stmt.condition);
    const jmpElse = this.instructions.length;
    this.emitInstruction(OpCode.TEST, condReg, 0, 0);
    this.emitInstruction(OpCode.JMP, 0, 0, 0);

    this.emitBlock(stmt.elseBranch);

    const endPos = this.instructions.length;
    this.patchJump(jmpElse + 1, endPos - jmpElse - 1);
    this.freeReg = condReg;
  }

  private emitExpression(expr: AST.Expression, targetReg?: number): number {
    const reg = targetReg ?? this.allocReg();

    switch (expr.kind) {
      case 'Literal':
        this.emitLiteral(expr, reg);
        break;

      case 'Identifier':
        this.emitIdentifier(expr, reg);
        break;

      case 'Binary':
        this.emitBinary(expr, reg);
        break;

      case 'Unary':
        this.emitUnary(expr, reg);
        break;

      case 'Call':
        this.emitCall(expr, reg);
        break;

      case 'Member':
        this.emitMember(expr, reg);
        break;

      case 'Index':
        this.emitIndex(expr, reg);
        break;

      case 'Assignment':
        this.emitAssignment(expr, reg);
        break;

      case 'Lambda':
        this.emitLambda(expr, reg);
        break;

      case 'Array':
        this.emitArray(expr, reg);
        break;

      case 'Table':
        this.emitTable(expr, reg);
        break;

      case 'Ternary':
        this.emitTernary(expr, reg);
        break;

      case 'Await':
        this.emitAwait(expr, reg);
        break;

      case 'TypeCast':
        this.emitExpression(expr.expression, reg);
        break;

      case 'TypeCheck':
        this.emitTypeCheck(expr, reg);
        break;

      case 'BlockExpr':
        this.emitBlock(expr.block);
        break;

      default:
        throw new Error(`Unknown expression kind: ${(expr as any).kind}`);
    }

    return reg;
  }

  private emitLiteral(expr: AST.Literal, reg: number): void {
    if (expr.value === null) {
      this.emitInstruction(OpCode.LOADNIL, reg, 0, 0);
    } else if (typeof expr.value === 'boolean') {
      this.emitInstruction(OpCode.LOADBOOL, reg, expr.value ? 1 : 0, 0);
    } else if (typeof expr.value === 'number') {
      if (Number.isInteger(expr.value) && expr.value >= -131071 && expr.value <= 131071) {
        this.emitInstruction(OpCode.LOADINT, reg, expr.value & 0x3FFFF, 0);
      } else {
        const idx = this.addConstant({ type: 'number', value: expr.value });
        this.emitInstruction(OpCode.LOADK, reg, idx, 0);
      }
    } else if (typeof expr.value === 'string') {
      const idx = this.addConstant({ type: 'string', value: expr.value });
      this.emitInstruction(OpCode.LOADK, reg, idx, 0);
    }
  }

  private emitIdentifier(expr: AST.Identifier, reg: number): void {
    const localReg = this.locals.get(expr.name);
    if (localReg !== undefined) {
      if (reg !== localReg) {
        this.emitInstruction(OpCode.MOVE, reg, localReg, 0);
      }
    } else {
      const idx = this.addConstant({ type: 'string', value: expr.name });
      this.emitInstruction(OpCode.GETGLOBAL, reg, idx, 0);
    }
  }

  private emitBinary(expr: AST.BinaryExpr, reg: number): void {
    const leftReg = this.emitExpression(expr.left);
    const rightReg = this.emitExpression(expr.right);

    const opcodeMap: Record<string, OpCode> = {
      '+': OpCode.ADD,
      '-': OpCode.SUB,
      '*': OpCode.MUL,
      '/': OpCode.DIV,
      '%': OpCode.MOD,
      '**': OpCode.POW,
      '..': OpCode.CONCAT,
    };

    const cmpMap: Record<string, OpCode> = {
      '==': OpCode.EQ,
      '!=': OpCode.EQ,
      '<': OpCode.LT,
      '<=': OpCode.LE,
      '>': OpCode.LT,
      '>=': OpCode.LE,
    };

    if (opcodeMap[expr.operator]) {
      this.emitInstruction(opcodeMap[expr.operator], reg, leftReg, rightReg);
    } else if (cmpMap[expr.operator]) {
      const isEq = expr.operator === '==' || expr.operator === '!=';
      const isGt = expr.operator === '>' || expr.operator === '>=';
      const a = isEq ? (expr.operator === '!=' ? 0 : 1) : (isGt ? 1 : 0);
      this.emitInstruction(cmpMap[expr.operator], a, isGt ? rightReg : leftReg, isGt ? leftReg : rightReg);
      this.emitInstruction(OpCode.LOADBOOL, reg, 1, 1);
      this.emitInstruction(OpCode.LOADBOOL, reg, 0, 0);
    } else if (expr.operator === '&&') {
      const jmpFalse = this.instructions.length;
      this.emitInstruction(OpCode.TEST, leftReg, 0, 0);
      this.emitInstruction(OpCode.JMP, 0, 0, 0);
      this.emitInstruction(OpCode.MOVE, reg, rightReg, 0);
      const endPos = this.instructions.length;
      this.patchJump(jmpFalse + 1, endPos - jmpFalse - 1);
    } else if (expr.operator === '||') {
      const jmpTrue = this.instructions.length;
      this.emitInstruction(OpCode.TEST, leftReg, 0, 1);
      this.emitInstruction(OpCode.JMP, 0, 0, 0);
      this.emitInstruction(OpCode.MOVE, reg, rightReg, 0);
      const endPos = this.instructions.length;
      this.patchJump(jmpTrue + 1, endPos - jmpTrue - 1);
    }

    this.freeReg = leftReg;
  }

  private emitUnary(expr: AST.UnaryExpr, reg: number): void {
    const operandReg = this.emitExpression(expr.operand);

    switch (expr.operator) {
      case '-':
        this.emitInstruction(OpCode.UNM, reg, operandReg, 0);
        break;
      case '!':
      case 'not':
        this.emitInstruction(OpCode.NOT, reg, operandReg, 0);
        break;
      case '#':
        this.emitInstruction(OpCode.LEN, reg, operandReg, 0);
        break;
      case '~':
        // Bitwise not - not in base Lua, would need custom opcode
        break;
      default:
        this.emitInstruction(OpCode.MOVE, reg, operandReg, 0);
    }

    this.freeReg = operandReg;
  }

  private emitCall(expr: AST.CallExpr, reg: number): void {
    const funcReg = this.emitExpression(expr.callee);

    // Push arguments
    const argRegs: number[] = [];
    for (const arg of expr.args) {
      argRegs.push(this.emitExpression(arg.value));
    }

    // Move arguments to consecutive registers after function
    for (let i = 0; i < argRegs.length; i++) {
      if (argRegs[i] !== funcReg + 1 + i) {
        this.emitInstruction(OpCode.MOVE, funcReg + 1 + i, argRegs[i], 0);
      }
    }

    this.emitInstruction(OpCode.CALL, funcReg, argRegs.length + 1, 2);

    if (reg !== funcReg) {
      this.emitInstruction(OpCode.MOVE, reg, funcReg, 0);
    }

    this.freeReg = funcReg;
  }

  private emitMember(expr: AST.MemberExpr, reg: number): void {
    const objReg = this.emitExpression(expr.object);
    const keyIdx = this.addConstant({ type: 'string', value: expr.property });
    this.emitInstruction(OpCode.GETTABLE, reg, objReg, keyIdx);
    this.freeReg = objReg;
  }

  private emitIndex(expr: AST.IndexExpr, reg: number): void {
    const objReg = this.emitExpression(expr.object);
    const idxReg = this.emitExpression(expr.index);
    this.emitInstruction(OpCode.GETTABLE, reg, objReg, idxReg);
    this.freeReg = objReg;
  }

  private emitAssignment(expr: AST.AssignmentExpr, reg: number): void {
    const valueReg = this.emitExpression(expr.value);

    if (expr.target.kind === 'Identifier') {
      const name = (expr.target as AST.Identifier).name;
      const localReg = this.locals.get(name);
      if (localReg !== undefined) {
        if (expr.operator === '=') {
          this.emitInstruction(OpCode.MOVE, localReg, valueReg, 0);
        } else {
          // Compound assignment
          const opMap: Record<string, OpCode> = {
            '+=': OpCode.ADD,
            '-=': OpCode.SUB,
            '*=': OpCode.MUL,
            '/=': OpCode.DIV,
          };
          if (opMap[expr.operator]) {
            this.emitInstruction(opMap[expr.operator], localReg, localReg, valueReg);
          }
        }
      } else {
        const idx = this.addConstant({ type: 'string', value: name });
        this.emitInstruction(OpCode.SETGLOBAL, valueReg, idx, 0);
      }
    } else if (expr.target.kind === 'Member') {
      const member = expr.target as AST.MemberExpr;
      const objReg = this.emitExpression(member.object);
      const keyIdx = this.addConstant({ type: 'string', value: member.property });
      this.emitInstruction(OpCode.SETTABLE, objReg, keyIdx, valueReg);
    } else if (expr.target.kind === 'Index') {
      const index = expr.target as AST.IndexExpr;
      const objReg = this.emitExpression(index.object);
      const idxReg = this.emitExpression(index.index);
      this.emitInstruction(OpCode.SETTABLE, objReg, idxReg, valueReg);
    }

    this.emitInstruction(OpCode.MOVE, reg, valueReg, 0);
    this.freeReg = valueReg;
  }

  private emitLambda(expr: AST.LambdaExpr, reg: number): void {
    // Convert lambda to anonymous function
    const fnDecl: AST.FnDecl = {
      kind: 'FnDecl',
      name: '<lambda>',
      isAsync: expr.isAsync,
      isPub: false,
      generics: [],
      params: expr.params,
      returnType: expr.returnType,
      body: expr.body.kind === 'Block' ? expr.body as AST.Block : {
        kind: 'Block',
        statements: [{
          kind: 'Return',
          value: expr.body as AST.Expression,
          span: expr.span
        }],
        span: expr.span
      },
      span: expr.span
    };

    const proto = this.emitFunctionProto(fnDecl);
    const constIdx = this.addConstant({ type: 'nil', value: null });
    this.emitInstruction(OpCode.CLOSURE, reg, constIdx, 0);
  }

  private emitArray(expr: AST.ArrayExpr, reg: number): void {
    this.emitInstruction(OpCode.NEWTABLE, reg, expr.elements.length, 0);

    for (let i = 0; i < expr.elements.length; i++) {
      const elemReg = this.emitExpression(expr.elements[i]);
      const idxReg = this.allocReg();
      this.emitInstruction(OpCode.LOADINT, idxReg, i + 1, 0);
      this.emitInstruction(OpCode.SETTABLE, reg, idxReg, elemReg);
    }
  }

  private emitTable(expr: AST.TableExpr, reg: number): void {
    this.emitInstruction(OpCode.NEWTABLE, reg, 0, 0);

    for (const entry of expr.entries) {
      let keyReg: number;
      if (typeof entry.key === 'string') {
        keyReg = this.allocReg();
        const idx = this.addConstant({ type: 'string', value: entry.key });
        this.emitInstruction(OpCode.LOADK, keyReg, idx, 0);
      } else {
        keyReg = this.emitExpression(entry.key as AST.Expression);
      }

      const valueReg = this.emitExpression(entry.value);
      this.emitInstruction(OpCode.SETTABLE, reg, keyReg, valueReg);
    }
  }

  private emitTernary(expr: AST.TernaryExpr, reg: number): void {
    const condReg = this.emitExpression(expr.condition);

    const jmpElse = this.instructions.length;
    this.emitInstruction(OpCode.TEST, condReg, 0, 0);
    this.emitInstruction(OpCode.JMP, 0, 0, 0);

    const thenReg = this.emitExpression(expr.thenExpr);
    if (thenReg !== reg) {
      this.emitInstruction(OpCode.MOVE, reg, thenReg, 0);
    }

    const jmpEnd = this.instructions.length;
    this.emitInstruction(OpCode.JMP, 0, 0, 0);

    const elsePos = this.instructions.length;
    this.patchJump(jmpElse + 1, elsePos - jmpElse - 1);

    const elseReg = this.emitExpression(expr.elseExpr);
    if (elseReg !== reg) {
      this.emitInstruction(OpCode.MOVE, reg, elseReg, 0);
    }

    const endPos = this.instructions.length;
    this.patchJump(jmpEnd, endPos - jmpEnd - 1);

    this.freeReg = condReg;
  }

  private emitAwait(expr: AST.AwaitExpr, reg: number): void {
    const operandReg = this.emitExpression(expr.expression);
    this.emitInstruction(OpCode.AWAIT, reg, operandReg, 0);
    this.freeReg = operandReg;
  }

  private emitTypeCheck(expr: AST.TypeCheckExpr, reg: number): void {
    const valueReg = this.emitExpression(expr.expression);
    // Type check is a runtime operation
    this.emitInstruction(OpCode.TYPECHECK, valueReg, 0, 0);
    this.emitInstruction(OpCode.LOADBOOL, reg, 1, 0);
    this.freeReg = valueReg;
  }

  private emitInstruction(op: OpCode, a: number, b: number, c: number): void {
    const instruction = (op & 0x3F) | ((a & 0xFF) << 6) | ((b & 0x1FF) << 14) | ((c & 0x1FF) << 23);
    this.instructions.push(instruction >>> 0);
  }

  private patchJump(instructionIndex: number, offset: number): void {
    const inst = this.instructions[instructionIndex];
    const op = inst & 0x3F;
    const a = (inst >> 6) & 0xFF;
    this.instructions[instructionIndex] = (op & 0x3F) | ((a & 0xFF) << 6) | ((offset & 0x3FFFF) << 14);
  }

  private addConstant(c: Constant): number {
    // Check for existing constant
    for (let i = 0; i < this.constants.length; i++) {
      const existing = this.constants[i];
      if (existing.type === c.type && existing.value === c.value) {
        return i;
      }
    }
    this.constants.push(c);
    return this.constants.length - 1;
  }

  private allocReg(): number {
    return this.freeReg++;
  }
}

export function emit(program: AST.Program): Uint8Array {
  return new BytecodeEmitter().emit(program);
                          }
