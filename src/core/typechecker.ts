// Luazi Type Checker
// Hindley-Milner style inference with gradual typing support

import * as AST from './ast';
import { Type, tAny, tNil, tBool, tNumber, tString, tTable, tFunction, tThread, tUserData } from './types';

export class TypeError extends Error {
  constructor(message: string, public span?: AST.Span) {
    super(message);
    this.name = 'TypeError';
  }
}

interface TypeScheme {
  vars: string[];
  type: Type;
}

interface TypeEnv {
  parent?: TypeEnv;
  bindings: Map<string, TypeScheme>;
}

export class TypeChecker {
  private env: TypeEnv;
  private typeVarCounter: number = 0;
  private errors: TypeError[] = [];

  constructor() {
    this.env = { bindings: new Map() };
    this.initBuiltins();
  }

  private initBuiltins(): void {
    this.env.bindings.set('print', { vars: [], type: tFunction([tAny], tNil) });
    this.env.bindings.set('type', { vars: [], type: tFunction([tAny], tString) });
    this.env.bindings.set('tonumber', { vars: [], type: tFunction([tString], tNumber) });
    this.env.bindings.set('tostring', { vars: [], type: tFunction([tAny], tString) });
    this.env.bindings.set('pairs', { vars: [], type: tFunction([tTable], tAny) });
    this.env.bindings.set('ipairs', { vars: [], type: tFunction([tTable], tAny) });
    this.env.bindings.set('assert', { vars: [], type: tFunction([tBool, tString], tAny) });
    this.env.bindings.set('error', { vars: [], type: tFunction([tString], tNil) });
    this.env.bindings.set('pcall', { vars: [], type: tFunction([tFunction([], tAny)], tBool) });
    this.env.bindings.set('xpcall', { vars: [], type: tFunction([tFunction([], tAny), tFunction([tString], tNil)], tBool) });
    this.env.bindings.set('select', { vars: [], type: tFunction([tNumber, tAny], tAny) });
    this.env.bindings.set('collectgarbage', { vars: [], type: tFunction([tString], tNumber) });
    this.env.bindings.set('rawget', { vars: [], type: tFunction([tTable, tAny], tAny) });
    this.env.bindings.set('rawset', { vars: [], type: tFunction([tTable, tAny, tAny], tNil) });
    this.env.bindings.set('rawequal', { vars: [], type: tFunction([tAny, tAny], tBool) });
    this.env.bindings.set('rawlen', { vars: [], type: tFunction([tAny], tNumber) });
    this.env.bindings.set('require', { vars: [], type: tFunction([tString], tAny) });
    this.env.bindings.set('dofile', { vars: [], type: tFunction([tString], tAny) });
    this.env.bindings.set('loadfile', { vars: [], type: tFunction([tString], tFunction([], tAny)) });
    this.env.bindings.set('load', { vars: [], type: tFunction([tString, tString], tFunction([], tAny)) });
    this.env.bindings.set('loadstring', { vars: [], type: tFunction([tString], tFunction([], tAny)) });
    this.env.bindings.set('next', { vars: [], type: tFunction([tTable, tAny], tAny) });
    this.env.bindings.set('unpack', { vars: [], type: tFunction([tTable], tAny) });
    this.env.bindings.set('pack', { vars: [], type: tFunction([tAny], tTable) });
    this.env.bindings.set('math', { vars: [], type: tTable });
    this.env.bindings.set('string', { vars: [], type: tTable });
    this.env.bindings.set('table', { vars: [], type: tTable });
    this.env.bindings.set('os', { vars: [], type: tTable });
    this.env.bindings.set('io', { vars: [], type: tTable });
    this.env.bindings.set('coroutine', { vars: [], type: tTable });
    this.env.bindings.set('debug', { vars: [], type: tTable });
    this.env.bindings.set('package', { vars: [], type: tTable });
  }

  check(program: AST.Program): TypeError[] {
    this.errors = [];
    for (const stmt of program.body) {
      this.inferStatement(stmt);
    }
    return this.errors;
  }

  private inferStatement(stmt: AST.Statement): void {
    try {
      switch (stmt.kind) {
        case 'VarDecl':
          this.inferVarDecl(stmt);
          break;
        case 'FnDecl':
          this.inferFnDecl(stmt);
          break;
        case 'If':
          this.inferIfStmt(stmt);
          break;
        case 'While':
          this.inferWhileStmt(stmt);
          break;
        case 'For':
          this.inferForStmt(stmt);
          break;
        case 'ForIn':
          this.inferForInStmt(stmt);
          break;
        case 'Match':
          this.inferMatchStmt(stmt);
          break;
        case 'Return':
          this.inferReturnStmt(stmt);
          break;
        case 'ExprStmt':
          this.inferExpression(stmt.expression);
          break;
        case 'Block':
          this.inferBlock(stmt);
          break;
        case 'StructDecl':
          this.inferStructDecl(stmt);
          break;
        case 'EnumDecl':
          this.inferEnumDecl(stmt);
          break;
        case 'TraitDecl':
          this.inferTraitDecl(stmt);
          break;
        case 'ImplDecl':
          this.inferImplDecl(stmt);
          break;
        case 'Import':
          break;
        case 'Export':
          this.inferStatement(stmt.declaration);
          break;
        case 'Defer':
          this.inferExpression(stmt.expression);
          break;
        case 'Guard':
          this.inferGuardStmt(stmt);
          break;
        default:
          break;
      }
    } catch (e) {
      if (e instanceof TypeError) {
        this.errors.push(e);
      } else {
        throw e;
      }
    }
  }

  private inferVarDecl(decl: AST.VarDecl): void {
    const initType = decl.initializer
      ? this.inferExpression(decl.initializer)
      : tAny;

    if (decl.typeAnnotation) {
      const annotatedType = this.typeFromExpr(decl.typeAnnotation);
      if (!this.unify(initType, annotatedType)) {
        this.errors.push(new TypeError(
          `Type mismatch: expected ${this.typeToString(annotatedType)}, got ${this.typeToString(initType)}`,
          decl.span
        ));
      }
    }

    const scheme = this.generalize(initType);
    this.env.bindings.set(decl.name, scheme);
  }

  private inferFnDecl(decl: AST.FnDecl): void {
    // Create parameter types
    const paramTypes: Type[] = decl.params.map(p =>
      p.type ? this.typeFromExpr(p.type) : this.freshVar()
    );

    const returnType = decl.returnType
      ? this.typeFromExpr(decl.returnType)
      : this.freshVar();

    const fnType = tFunction(paramTypes, returnType);
    this.env.bindings.set(decl.name, { vars: [], type: fnType });

    // Create new scope for function body
    const oldEnv = this.env;
    this.env = { parent: oldEnv, bindings: new Map() };

    // Bind parameters
    for (let i = 0; i < decl.params.length; i++) {
      this.env.bindings.set(decl.params[i].name, { vars: [], type: paramTypes[i] });
    }

    // Infer body
    const bodyType = this.inferBlock(decl.body);

    // Check return type compatibility
    if (!this.unify(bodyType, returnType)) {
      this.errors.push(new TypeError(
        `Function '${decl.name}' return type mismatch: expected ${this.typeToString(returnType)}, got ${this.typeToString(bodyType)}`,
        decl.span
      ));
    }

    this.env = oldEnv;
  }

  private inferIfStmt(stmt: AST.IfStmt): void {
    const condType = this.inferExpression(stmt.condition);
    if (!this.unify(condType, tBool)) {
      this.errors.push(new TypeError(
        `If condition must be boolean, got ${this.typeToString(condType)}`,
        stmt.span
      ));
    }

    this.inferBlock(stmt.thenBranch);
    if (stmt.elseBranch) {
      if (stmt.elseBranch.kind === 'If') {
        this.inferIfStmt(stmt.elseBranch);
      } else {
        this.inferBlock(stmt.elseBranch);
      }
    }
  }

  private inferWhileStmt(stmt: AST.WhileStmt): void {
    const condType = this.inferExpression(stmt.condition);
    if (!this.unify(condType, tBool)) {
      this.errors.push(new TypeError(
        `While condition must be boolean, got ${this.typeToString(condType)}`,
        stmt.span
      ));
    }
    this.inferBlock(stmt.body);
  }

  private inferForStmt(stmt: AST.ForStmt): void {
    if (stmt.init) {
      if (stmt.init.kind === 'VarDecl') {
        this.inferVarDecl(stmt.init);
      } else if (stmt.init.kind === 'ExprStmt') {
        this.inferExpression(stmt.init.expression);
      }
    }
    if (stmt.condition) {
      const condType = this.inferExpression(stmt.condition);
      if (!this.unify(condType, tBool)) {
        this.errors.push(new TypeError(
          `For condition must be boolean, got ${this.typeToString(condType)}`,
          stmt.span
        ));
      }
    }
    if (stmt.increment) {
      this.inferExpression(stmt.increment);
    }
    this.inferBlock(stmt.body);
  }

  private inferForInStmt(stmt: AST.ForInStmt): void {
    const iterType = this.inferExpression(stmt.iterable);
    if (!this.unify(iterType, tTable) && !this.isArrayType(iterType)) {
      this.errors.push(new TypeError(
        `For-in requires iterable, got ${this.typeToString(iterType)}`,
        stmt.span
      ));
    }

    const oldEnv = this.env;
    this.env = { parent: oldEnv, bindings: new Map() };
    this.env.bindings.set(stmt.varName, { vars: [], type: tAny });
    this.inferBlock(stmt.body);
    this.env = oldEnv;
  }

  private inferMatchStmt(stmt: AST.MatchStmt): void {
    const exprType = this.inferExpression(stmt.expression);

    for (const arm of stmt.arms) {
      const patternType = this.inferPattern(arm.pattern);
      if (!this.unify(patternType, exprType)) {
        this.errors.push(new TypeError(
          `Pattern type ${this.typeToString(patternType)} does not match expression type ${this.typeToString(exprType)}`,
          arm.span
        ));
      }

      if (arm.guard) {
        const guardType = this.inferExpression(arm.guard);
        if (!this.unify(guardType, tBool)) {
          this.errors.push(new TypeError(
            `Guard must be boolean, got ${this.typeToString(guardType)}`,
            arm.span
          ));
        }
      }

      if (arm.body.kind === 'Block') {
        this.inferBlock(arm.body);
      } else {
        this.inferExpression(arm.body as AST.Expression);
      }
    }
  }

  private inferReturnStmt(stmt: AST.ReturnStmt): void {
    if (stmt.value) {
      this.inferExpression(stmt.value);
    }
  }

  private inferGuardStmt(stmt: AST.GuardStmt): void {
    const condType = this.inferExpression(stmt.condition);
    if (!this.unify(condType, tBool)) {
      this.errors.push(new TypeError(
        `Guard condition must be boolean, got ${this.typeToString(condType)}`,
        stmt.span
      ));
    }
    this.inferBlock(stmt.elseBranch);
  }

  private inferStructDecl(decl: AST.StructDecl): void {
    const fieldTypes: Map<string, Type> = new Map();
    for (const field of decl.fields) {
      fieldTypes.set(field.name, field.type ? this.typeFromExpr(field.type) : tAny);
    }

    const structType: Type = {
      kind: 'Struct',
      name: decl.name,
      fields: fieldTypes,
      generics: decl.generics.map(g => g.name)
    };

    this.env.bindings.set(decl.name, { vars: [], type: structType });
  }

  private inferEnumDecl(decl: AST.EnumDecl): void {
    const enumType: Type = {
      kind: 'Enum',
      name: decl.name,
      variants: decl.variants.map(v => v.name),
      generics: decl.generics.map(g => g.name)
    };
    this.env.bindings.set(decl.name, { vars: [], type: enumType });
  }

  private inferTraitDecl(decl: AST.TraitDecl): void {
    const traitType: Type = {
      kind: 'Trait',
      name: decl.name,
      generics: decl.generics.map(g => g.name)
    };
    this.env.bindings.set(decl.name, { vars: [], type: traitType });
  }

  private inferImplDecl(decl: AST.ImplDecl): void {
    const targetType = this.typeFromExpr(decl.target);
    if (decl.trait) {
      const traitType = this.typeFromExpr(decl.trait);
      // Check that target implements trait
      // In full implementation, verify all trait methods are present
    }

    for (const method of decl.methods) {
      this.inferFnDecl(method);
    }
  }

  private inferBlock(block: AST.Block): Type {
    const oldEnv = this.env;
    this.env = { parent: oldEnv, bindings: new Map() };

    let lastType = tNil;
    for (const stmt of block.statements) {
      this.inferStatement(stmt);
      if (stmt.kind === 'ExprStmt') {
        lastType = this.inferExpression(stmt.expression);
      } else if (stmt.kind === 'Return') {
        if (stmt.value) {
          lastType = this.inferExpression(stmt.value);
        }
      }
    }

    this.env = oldEnv;
    return lastType;
  }

  private inferExpression(expr: AST.Expression): Type {
    switch (expr.kind) {
      case 'Literal':
        return this.inferLiteral(expr);
      case 'Identifier':
        return this.inferIdentifier(expr);
      case 'Binary':
        return this.inferBinary(expr);
      case 'Unary':
        return this.inferUnary(expr);
      case 'Call':
        return this.inferCall(expr);
      case 'Member':
        return this.inferMember(expr);
      case 'Index':
        return this.inferIndex(expr);
      case 'Assignment':
        return this.inferAssignment(expr);
      case 'Lambda':
        return this.inferLambda(expr);
      case 'Array':
        return this.inferArray(expr);
      case 'Table':
        return this.inferTable(expr);
      case 'Ternary':
        return this.inferTernary(expr);
      case 'Await':
        return this.inferExpression(expr.expression);
      case 'TypeCast':
        return this.typeFromExpr(expr.targetType);
      case 'TypeCheck':
        return tBool;
      case 'BlockExpr':
        return this.inferBlock(expr.block);
      case 'Spread':
        return this.inferExpression(expr.expression);
      case 'Range':
        return tTable;
      case 'Tuple':
        return { kind: 'Tuple', elements: expr.elements.map(e => this.inferExpression(e)) };
      case 'Try':
        return this.inferExpression(expr.expression);
      case 'Yield':
        return expr.expression ? this.inferExpression(expr.expression) : tNil;
      default:
        return tAny;
    }
  }

  private inferLiteral(expr: AST.Literal): Type {
    if (expr.value === null) return tNil;
    if (typeof expr.value === 'boolean') return tBool;
    if (typeof expr.value === 'number') return tNumber;
    if (typeof expr.value === 'string') return tString;
    return tAny;
  }

  private inferIdentifier(expr: AST.Identifier): Type {
    const scheme = this.lookup(expr.name);
    if (scheme) {
      return this.instantiate(scheme);
    }
    return tAny;
  }

  private inferBinary(expr: AST.BinaryExpr): Type {
    const leftType = this.inferExpression(expr.left);
    const rightType = this.inferExpression(expr.right);

    switch (expr.operator) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
      case '**':
        if (!this.unify(leftType, tNumber)) {
          this.errors.push(new TypeError(
            `Arithmetic operator '${expr.operator}' requires number, got ${this.typeToString(leftType)}`,
            expr.span
          ));
        }
        if (!this.unify(rightType, tNumber)) {
          this.errors.push(new TypeError(
            `Arithmetic operator '${expr.operator}' requires number, got ${this.typeToString(rightType)}`,
            expr.span
          ));
        }
        return tNumber;

      case '..':
        if (!this.unify(leftType, tString)) {
          this.errors.push(new TypeError(
            `Concatenation requires string, got ${this.typeToString(leftType)}`,
            expr.span
          ));
        }
        if (!this.unify(rightType, tString)) {
          this.errors.push(new TypeError(
            `Concatenation requires string, got ${this.typeToString(rightType)}`,
            expr.span
          ));
        }
        return tString;

      case '==':
      case '!=':
        this.unify(leftType, rightType);
        return tBool;

      case '<':
      case '<=':
      case '>':
      case '>=':
        if (!this.unify(leftType, tNumber)) {
          this.errors.push(new TypeError(
            `Comparison requires number, got ${this.typeToString(leftType)}`,
            expr.span
          ));
        }
        if (!this.unify(rightType, tNumber)) {
          this.errors.push(new TypeError(
            `Comparison requires number, got ${this.typeToString(rightType)}`,
            expr.span
          ));
        }
        return tBool;

      case '&&':
      case '||':
        if (!this.unify(leftType, tBool)) {
          this.errors.push(new TypeError(
            `Logical operator requires boolean, got ${this.typeToString(leftType)}`,
            expr.span
          ));
        }
        if (!this.unify(rightType, tBool)) {
          this.errors.push(new TypeError(
            `Logical operator requires boolean, got ${this.typeToString(rightType)}`,
            expr.span
          ));
        }
        return tBool;

      case '&':
      case '|':
      case '^':
      case '<<':
      case '>>':
        if (!this.unify(leftType, tNumber)) {
          this.errors.push(new TypeError(
            `Bitwise operator requires number, got ${this.typeToString(leftType)}`,
            expr.span
          ));
        }
        if (!this.unify(rightType, tNumber)) {
          this.errors.push(new TypeError(
            `Bitwise operator requires number, got ${this.typeToString(rightType)}`,
            expr.span
          ));
        }
        return tNumber;

      default:
        return tAny;
    }
  }

  private inferUnary(expr: AST.UnaryExpr): Type {
    const operandType = this.inferExpression(expr.operand);

    switch (expr.operator) {
      case '-':
        if (!this.unify(operandType, tNumber)) {
          this.errors.push(new TypeError(
            `Unary minus requires number, got ${this.typeToString(operandType)}`,
            expr.span
          ));
        }
        return tNumber;
      case '!':
      case 'not':
        if (!this.unify(operandType, tBool)) {
          this.errors.push(new TypeError(
            `Logical not requires boolean, got ${this.typeToString(operandType)}`,
            expr.span
          ));
        }
        return tBool;
      case '#':
        if (!this.unify(operandType, tString) && !this.unify(operandType, tTable)) {
          this.errors.push(new TypeError(
            `Length operator requires string or table, got ${this.typeToString(operandType)}`,
            expr.span
          ));
        }
        return tNumber;
      case '~':
        if (!this.unify(operandType, tNumber)) {
          this.errors.push(new TypeError(
            `Bitwise not requires number, got ${this.typeToString(operandType)}`,
            expr.span
          ));
        }
        return tNumber;
      case 'ref':
        return { kind: 'Ref', inner: operandType };
      case 'mut':
        return { kind: 'Mut', inner: operandType };
      default:
        return operandType;
    }
  }

  private inferCall(expr: AST.CallExpr): Type {
    const calleeType = this.inferExpression(expr.callee);

    if (calleeType.kind === 'Function') {
      const fnType = calleeType as any;
      const paramTypes = fnType.params || [];
      const returnType = fnType.returnType || tAny;

      // Check argument count
      if (expr.args.length > paramTypes.length) {
        this.errors.push(new TypeError(
          `Too many arguments: expected ${paramTypes.length}, got ${expr.args.length}`,
          expr.span
        ));
      }

      // Check argument types
      for (let i = 0; i < Math.min(expr.args.length, paramTypes.length); i++) {
        const argType = this.inferExpression(expr.args[i].value);
        if (!this.unify(argType, paramTypes[i])) {
          this.errors.push(new TypeError(
            `Argument ${i + 1} type mismatch: expected ${this.typeToString(paramTypes[i])}, got ${this.typeToString(argType)}`,
            expr.span
          ));
        }
      }

      return returnType;
    }

    return tAny;
  }

  private inferMember(expr: AST.MemberExpr): Type {
    const objType = this.inferExpression(expr.object);

    if (objType.kind === 'Struct') {
      const structType = objType as any;
      const fieldType = structType.fields?.get(expr.property);
      if (fieldType) return fieldType;
    }

    if (objType.kind === 'Table') {
      return tAny;
    }

    return tAny;
  }

  private inferIndex(expr: AST.IndexExpr): Type {
    const objType = this.inferExpression(expr.object);
    const idxType = this.inferExpression(expr.index);

    if (objType.kind === 'Array' || objType.kind === 'Table') {
      return tAny;
    }

    return tAny;
  }

  private inferAssignment(expr: AST.AssignmentExpr): Type {
    const valueType = this.inferExpression(expr.value);

    if (expr.target.kind === 'Identifier') {
      const name = (expr.target as AST.Identifier).name;
      const scheme = this.lookup(name);
      if (scheme) {
        const varType = this.instantiate(scheme);
        if (!this.unify(valueType, varType)) {
          this.errors.push(new TypeError(
            `Assignment type mismatch: expected ${this.typeToString(varType)}, got ${this.typeToString(valueType)}`,
            expr.span
          ));
        }
      }
    }

    return valueType;
  }

  private inferLambda(expr: AST.LambdaExpr): Type {
    const paramTypes = expr.params.map(p =>
      p.type ? this.typeFromExpr(p.type) : this.freshVar()
    );

    const oldEnv = this.env;
    this.env = { parent: oldEnv, bindings: new Map() };

    for (let i = 0; i < expr.params.length; i++) {
      this.env.bindings.set(expr.params[i].name, { vars: [], type: paramTypes[i] });
    }

    const bodyType = expr.body.kind === 'Block'
      ? this.inferBlock(expr.body as AST.Block)
      : this.inferExpression(expr.body as AST.Expression);

    this.env = oldEnv;

    return tFunction(paramTypes, bodyType);
  }

  private inferArray(expr: AST.ArrayExpr): Type {
    if (expr.elements.length === 0) {
      return { kind: 'Array', element: tAny };
    }

    const elemType = this.inferExpression(expr.elements[0]);
    for (let i = 1; i < expr.elements.length; i++) {
      const et = this.inferExpression(expr.elements[i]);
      this.unify(elemType, et);
    }

    return { kind: 'Array', element: elemType };
  }

  private inferTable(_expr: AST.TableExpr): Type {
    return tTable;
  }

  private inferTernary(expr: AST.TernaryExpr): Type {
    const condType = this.inferExpression(expr.condition);
    if (!this.unify(condType, tBool)) {
      this.errors.push(new TypeError(
        `Ternary condition must be boolean, got ${this.typeToString(condType)}`,
        expr.span
      ));
    }

    const thenType = this.inferExpression(expr.thenExpr);
    const elseType = this.inferExpression(expr.elseExpr);
    this.unify(thenType, elseType);

    return thenType;
  }

  private inferPattern(pattern: AST.Pattern): Type {
    switch (pattern.kind) {
      case 'WildcardPattern':
        return this.freshVar();
      case 'LiteralPattern':
        return this.inferLiteral(pattern.value);
      case 'VariablePattern':
        return this.freshVar();
      case 'StructPattern':
        return { kind: 'Struct', name: pattern.name, fields: new Map() };
      case 'EnumPattern':
        return { kind: 'Enum', name: pattern.enumName, variants: [] };
      case 'ArrayPattern':
        return { kind: 'Array', element: this.freshVar() };
      default:
        return tAny;
    }
  }

  private typeFromExpr(expr: AST.TypeExpr): Type {
    switch (expr.kind) {
      case 'NamedType':
        const name = (expr as AST.NamedType).name;
        switch (name) {
          case 'nil': return tNil;
          case 'bool': return tBool;
          case 'number': return tNumber;
          case 'string': return tString;
          case 'table': return tTable;
          case 'function': return tFunction([], tAny);
          case 'thread': return tThread;
          case 'any': return tAny;
          default:
            return { kind: 'Named', name };
        }
      case 'ArrayType':
        return { kind: 'Array', element: this.typeFromExpr((expr as AST.ArrayType).element) };
      case 'FunctionType':
        return tFunction(
          (expr as AST.FunctionType).params.map(p => this.typeFromExpr(p)),
          this.typeFromExpr((expr as AST.FunctionType).returnType)
        );
      case 'TupleType':
        return { kind: 'Tuple', elements: (expr as AST.TupleType).elements.map(e => this.typeFromExpr(e)) };
      case 'UnionType':
        return { kind: 'Union', types: (expr as AST.UnionType).types.map(t => this.typeFromExpr(t)) };
      case 'IntersectionType':
        return { kind: 'Intersection', types: (expr as AST.IntersectionType).types.map(t => this.typeFromExpr(t)) };
      case 'OptionalType':
        return { kind: 'Union', types: [this.typeFromExpr((expr as AST.OptionalType).inner), tNil] };
      case 'RefType':
        return { kind: 'Ref', inner: this.typeFromExpr((expr as AST.RefType).inner) };
      case 'MutType':
        return { kind: 'Mut', inner: this.typeFromExpr((expr as AST.MutType).inner) };
      case 'GenericType':
        return { kind: 'Generic', name: (expr as AST.GenericType).name, args: (expr as AST.GenericType).args.map(a => this.typeFromExpr(a)) };
      case 'SelfType':
        return { kind: 'Self' };
      default:
        return tAny;
    }
  }

  private unify(t1: Type, t2: Type): boolean {
    // Deep structural unification
    if (t1.kind === 'Any' || t2.kind === 'Any') return true;
    if (t1.kind === 'Unknown' || t2.kind === 'Unknown') return true;
    if (t1.kind !== t2.kind) return false;

    switch (t1.kind) {
      case 'Nil':
      case 'Bool':
      case 'Number':
      case 'String':
      case 'Table':
      case 'Thread':
      case 'UserData':
        return true;

      case 'Function': {
        const f1 = t1 as any;
        const f2 = t2 as any;
        if (f1.params?.length !== f2.params?.length) return false;
        for (let i = 0; i < (f1.params?.length || 0); i++) {
          if (!this.unify(f1.params[i], f2.params[i])) return false;
        }
        return this.unify(f1.returnType || tAny, f2.returnType || tAny);
      }

      case 'Array': {
        const a1 = t1 as any;
        const a2 = t2 as any;
        return this.unify(a1.element || tAny, a2.element || tAny);
      }

      case 'Tuple': {
        const tup1 = t1 as any;
        const tup2 = t2 as any;
        if (tup1.elements?.length !== tup2.elements?.length) return false;
        for (let i = 0; i < (tup1.elements?.length || 0); i++) {
          if (!this.unify(tup1.elements[i], tup2.elements[i])) return false;
        }
        return true;
      }

      case 'Union': {
        const u1 = t1 as any;
        const u2 = t2 as any;
        if (u1.types?.length !== u2.types?.length) return false;
        for (let i = 0; i < (u1.types?.length || 0); i++) {
          if (!this.unify(u1.types[i], u2.types[i])) return false;
        }
        return true;
      }

      case 'Ref':
      case 'Mut': {
        const r1 = t1 as any;
        const r2 = t2 as any;
        return this.unify(r1.inner || tAny, r2.inner || tAny);
      }

      case 'Struct': {
        const s1 = t1 as any;
        const s2 = t2 as any;
        if (s1.name !== s2.name) return false;
        // Check fields
        const f1 = s1.fields || new Map();
        const f2 = s2.fields || new Map();
        if (f1.size !== f2.size) return false;
        for (const [key, val] of f1) {
          const v2 = f2.get(key);
          if (!v2 || !this.unify(val, v2)) return false;
        }
        return true;
      }

      default:
        return true;
    }
  }

  private freshVar(): Type {
    return { kind: 'Var', id: this.typeVarCounter++ };
  }

  private generalize(type: Type): TypeScheme {
    const freeVars = this.freeTypeVars(type);
    return { vars: freeVars, type };
  }

  private instantiate(scheme: TypeScheme): Type {
    // In full HM, substitute type variables with fresh ones
    // For now, return the type directly
    return scheme.type;
  }

  private freeTypeVars(type: Type): string[] {
    // Simplified: return empty for now
    return [];
  }

  private lookup(name: string): TypeScheme | undefined {
    let env: TypeEnv | undefined = this.env;
    while (env) {
      const scheme = env.bindings.get(name);
      if (scheme) return scheme;
      env = env.parent;
    }
    return undefined;
  }

  private isArrayType(type: Type): boolean {
    return type.kind === 'Array' || type.kind === 'Tuple';
  }

  private typeToString(type: Type): string {
    switch (type.kind) {
      case 'Nil': return 'nil';
      case 'Bool': return 'bool';
      case 'Number': return 'number';
      case 'String': return 'string';
      case 'Table': return 'table';
      case 'Thread': return 'thread';
      case 'UserData': return 'userdata';
      case 'Any': return 'any';
      case 'Function': {
        const fn = type as any;
        const params = fn.params?.map((p: Type) => this.typeToString(p)).join(', ') || '';
        const ret = fn.returnType ? this.typeToString(fn.returnType) : 'nil';
        return `(${params}) -> ${ret}`;
      }
      case 'Array': {
        const arr = type as any;
        return `[${this.typeToString(arr.element || tAny)}]`;
      }
      case 'Tuple': {
        const tup = type as any;
        return `(${tup.elements?.map((e: Type) => this.typeToString(e)).join(', ') || ''})`;
      }
      case 'Union': {
        const u = type as any;
        return u.types?.map((t: Type) => this.typeToString(t)).join(' | ') || 'any';
      }
      case 'Struct': {
        const s = type as any;
        return s.name || 'struct';
      }
      case 'Enum': {
        const e = type as any;
        return e.name || 'enum';
      }
      case 'Trait': {
        const t = type as any;
        return t.name || 'trait';
      }
      case 'Ref': {
        const r = type as any;
        return `ref ${this.typeToString(r.inner || tAny)}`;
      }
      case 'Mut': {
        const m = type as any;
        return `mut ${this.typeToString(m.inner || tAny)}`;
      }
      case 'Var': {
        const v = type as any;
        return `t${v.id || 0}`;
      }
      default:
        return type.kind;
    }
  }
}

export function typeCheck(program: AST.Program): TypeError[] {
  return new TypeChecker().check(program);
    }
