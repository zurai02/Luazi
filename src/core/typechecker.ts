// Luazi Type Checker
// Hindley-Milner type inference with gradual typing

import * as AST from './ast';
import * as Types from './types';
import { Type, TypeKind, tUnknown, tAny, tNil, tBool, tNumber, tString, tFunction, tArray, tTable, tUnion, tOptional, tGeneric, tNamed, typeToString } from './types';

export interface TypeError {
  message: string;
  span: AST.Span;
}

interface TypeVariable {
  kind: 'Var';
  id: number;
  instance?: Type;
}

interface Scheme {
  vars: TypeVariable[];
  type: Type;
}

class TypeEnv {
  private map: Map<string, Scheme> = new Map();
  private parent: TypeEnv | null = null;

  constructor(parent?: TypeEnv) {
    if (parent) this.parent = parent;
  }

  get(name: string): Scheme | undefined {
    return this.map.get(name) ?? this.parent?.get(name);
  }

  set(name: string, scheme: Scheme): void {
    this.map.set(name, scheme);
  }

  child(): TypeEnv {
    return new TypeEnv(this);
  }
}

export class TypeChecker {
  private env: TypeEnv = new TypeEnv();
  private errors: TypeError[] = [];
  private varCounter: number = 0;
  private strictMode: boolean = false;

  constructor(strict: boolean = false) {
    this.strictMode = strict;
    this.initBuiltins();
  }

  private initBuiltins(): void {
    // Core types
    this.env.set('print', { vars: [], type: tFunction([{ name: 'args', type: tAny, isOptional: false, isRest: true }], tNil) });
    this.env.set('println', { vars: [], type: tFunction([{ name: 'args', type: tAny, isOptional: false, isRest: true }], tNil) });
    this.env.set('type_of', { vars: [], type: tFunction([{ name: 'value', type: tAny, isOptional: false, isRest: false }], tString) });
    this.env.set('assert', { vars: [], type: tFunction([
      { name: 'condition', type: tBool, isOptional: false, isRest: false },
      { name: 'message', type: tString, isOptional: true, isRest: false }
    ], tNil) });
    this.env.set('panic', { vars: [], type: tFunction([{ name: 'message', type: tString, isOptional: true, isRest: false }], { kind: TypeKind.Never } as Type) });
    this.env.set('len', { vars: [this.freshVar()], type: tFunction([{ name: 'collection', type: tAny, isOptional: false, isRest: false }], tNumber) });
    this.env.set('clone', { vars: [this.freshVar()], type: tFunction([{ name: 'value', type: tAny, isOptional: false, isRest: false }], tAny) });

    // Math
    this.env.set('math', { vars: [], type: tNamed('math') });

    // Option type
    const t = this.freshVar();
    this.env.set('Option', { vars: [t], type: tGeneric('Option', [t]) });

    // Result type
    const t1 = this.freshVar();
    const t2 = this.freshVar();
    this.env.set('Result', { vars: [t1, t2], type: tGeneric('Result', [t1, t2]) });
  }

  check(program: AST.Program): TypeError[] {
    for (const stmt of program.body) {
      this.inferStatement(stmt);
    }
    return this.errors;
  }

  private inferStatement(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case 'VarDecl':
        this.inferVarDecl(stmt);
        break;
      case 'FnDecl':
        this.inferFnDecl(stmt);
        break;
      case 'If':
        this.inferIf(stmt);
        break;
      case 'While':
        this.inferWhile(stmt);
        break;
      case 'For':
        this.inferFor(stmt);
        break;
      case 'ForIn':
        this.inferForIn(stmt);
        break;
      case 'Match':
        this.inferMatch(stmt);
        break;
      case 'Return':
        this.inferReturn(stmt);
        break;
      case 'Break':
      case 'Continue':
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
        // Imports resolved at link time
        break;
      case 'Export':
        this.inferStatement(stmt.declaration);
        break;
      case 'Defer':
        this.inferExpression(stmt.expression);
        break;
      case 'Guard':
        this.inferGuard(stmt);
        break;
    }
  }

  private inferVarDecl(decl: AST.VarDecl): void {
    let initType: Type;

    if (decl.initializer) {
      initType = this.inferExpression(decl.initializer);
    } else {
      initType = tNil;
    }

    if (decl.typeAnnotation) {
      const annotatedType = this.typeFromExpr(decl.typeAnnotation);
      if (!this.unify(initType, annotatedType)) {
        this.error(
          `Type mismatch: expected ${typeToString(annotatedType)}, got ${typeToString(initType)}`,
          decl.span
        );
      }
      initType = annotatedType;
    }

    this.env.set(decl.name, { vars: this.freeVars(initType), type: initType });
  }

  private inferFnDecl(decl: AST.FnDecl): void {
    const paramTypes = decl.params.map(p => ({
      name: p.name,
      type: p.type ? this.typeFromExpr(p.type) : tAny,
      isOptional: p.defaultValue !== null,
      isRest: false
    }));

    const returnType = decl.returnType ? this.typeFromExpr(decl.returnType) : tAny;
    const fnType = tFunction(paramTypes, returnType, decl.isAsync);

    // Add to environment before checking body (for recursion)
    this.env.set(decl.name, { vars: [], type: fnType });

    // Check body in new scope
    const bodyEnv = this.env.child();
    for (const param of decl.params) {
      const pType = param.type ? this.typeFromExpr(param.type) : tAny;
      bodyEnv.set(param.name, { vars: [], type: pType });
    }

    const oldEnv = this.env;
    this.env = bodyEnv;
    this.inferBlock(decl.body);
    this.env = oldEnv;
  }

  private inferIf(stmt: AST.IfStmt): void {
    const condType = this.inferExpression(stmt.condition);
    if (!this.isBoolLike(condType) && this.strictMode) {
      this.error(`Condition must be boolean, got ${typeToString(condType)}`, stmt.condition.span);
    }

    this.inferBlock(stmt.thenBranch);
    if (stmt.elseBranch) {
      if (stmt.elseBranch.kind === 'If') {
        this.inferIf(stmt.elseBranch);
      } else {
        this.inferBlock(stmt.elseBranch);
      }
    }
  }

  private inferWhile(stmt: AST.WhileStmt): void {
    const condType = this.inferExpression(stmt.condition);
    if (!this.isBoolLike(condType) && this.strictMode) {
      this.error(`Condition must be boolean, got ${typeToString(condType)}`, stmt.condition.span);
    }
    this.inferBlock(stmt.body);
  }

  private inferFor(stmt: AST.ForStmt): void {
    const oldEnv = this.env;
    this.env = this.env.child();

    if (stmt.init) {
      if (stmt.init.kind === 'VarDecl') {
        this.inferVarDecl(stmt.init);
      } else if (stmt.init.kind === 'ExprStmt') {
        this.inferExpression(stmt.init.expression);
      }
    }

    if (stmt.condition) {
      const condType = this.inferExpression(stmt.condition);
      if (!this.isBoolLike(condType) && this.strictMode) {
        this.error(`For condition must be boolean`, stmt.condition.span);
      }
    }

    if (stmt.increment) {
      this.inferExpression(stmt.increment);
    }

    this.inferBlock(stmt.body);
    this.env = oldEnv;
  }

  private inferForIn(stmt: AST.ForInStmt): void {
    const iterType = this.inferExpression(stmt.iterable);
    const elemType = this.getElementType(iterType);

    const oldEnv = this.env;
    this.env = this.env.child();
    this.env.set(stmt.varName, { vars: [], type: elemType });
    this.inferBlock(stmt.body);
    this.env = oldEnv;
  }

  private inferMatch(stmt: AST.MatchStmt): void {
    const exprType = this.inferExpression(stmt.expression);

    for (const arm of stmt.arms) {
      const patternType = this.inferPattern(arm.pattern);
      if (!this.unify(patternType, exprType)) {
        this.error(`Pattern type ${typeToString(patternType)} does not match ${typeToString(exprType)}`, arm.pattern.span);
      }

      if (arm.guard) {
        const guardType = this.inferExpression(arm.guard);
        if (!this.isBoolLike(guardType) && this.strictMode) {
          this.error(`Guard must be boolean`, arm.guard.span);
        }
      }

      if (arm.body.kind === 'Block') {
        this.inferBlock(arm.body);
      } else {
        this.inferExpression(arm.body as AST.Expression);
      }
    }
  }

  private inferReturn(stmt: AST.ReturnStmt): Type {
    if (stmt.value) {
      return this.inferExpression(stmt.value);
    }
    return tNil;
  }

  private inferBlock(block: AST.Block): void {
    const oldEnv = this.env;
    this.env = this.env.child();
    for (const stmt of block.statements) {
      this.inferStatement(stmt);
    }
    this.env = oldEnv;
  }

  private inferStructDecl(decl: AST.StructDecl): void {
    const fieldTypes = new Map<string, Type>();
    for (const field of decl.fields) {
      fieldTypes.set(field.name, field.type ? this.typeFromExpr(field.type) : tAny);
    }

    const structType: Types.StructType = {
      kind: TypeKind.Struct,
      name: decl.name,
      fields: fieldTypes,
      methods: new Map()
    };

    this.env.set(decl.name, { vars: [], type: structType });
  }

  private inferEnumDecl(decl: AST.EnumDecl): void {
    const variants = decl.variants.map(v => ({
      name: v.name,
      fields: v.fields.map(f => f.type ? this.typeFromExpr(f.type) : tAny)
    }));

    const enumType: Types.EnumType = {
      kind: TypeKind.Enum,
      name: decl.name,
      variants
    };

    this.env.set(decl.name, { vars: [], type: enumType });
  }

  private inferTraitDecl(decl: AST.TraitDecl): void {
    const methods = new Map<string, Types.FunctionType>();
    for (const method of decl.methods) {
      const params = method.params.map(p => ({
        name: p.name,
        type: p.type ? this.typeFromExpr(p.type) : tAny,
        isOptional: p.defaultValue !== null,
        isRest: false
      }));
      const ret = method.returnType ? this.typeFromExpr(method.returnType) : tAny;
      methods.set(method.name, tFunction(params, ret) as Types.FunctionType);
    }

    const traitType: Types.TraitType = {
      kind: TypeKind.Trait,
      name: decl.name,
      methods
    };

    this.env.set(decl.name, { vars: [], type: traitType });
  }

  private inferImplDecl(decl: AST.ImplDecl): void {
    // Check that target type exists
    const targetType = this.typeFromExpr(decl.target);
    // Check that trait exists (if specified)
    if (decl.trait) {
      const traitType = this.typeFromExpr(decl.trait);
    }
    // Check method implementations
    for (const method of decl.methods) {
      this.inferFnDecl(method);
    }
  }

  private inferGuard(stmt: AST.GuardStmt): void {
    const condType = this.inferExpression(stmt.condition);
    if (!this.isBoolLike(condType) && this.strictMode) {
      this.error(`Guard condition must be boolean`, stmt.condition.span);
    }
    this.inferBlock(stmt.elseBranch);
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
      case 'Ternary':
        return this.inferTernary(expr);
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
      case 'Tuple':
        return this.inferTuple(expr);
      case 'Range':
        return tArray(tNumber);
      case 'Spread':
        return this.inferExpression(expr.expression);
      case 'Await':
        return this.inferAwait(expr);
      case 'Yield':
        return this.inferExpression(expr.expression ?? { kind: 'Literal', value: null, raw: 'nil', span: expr.span });
      case 'Try':
        return this.inferTry(expr);
      case 'TypeCast':
        return this.typeFromExpr(expr.targetType);
      case 'TypeCheck':
        return tBool;
      case 'BlockExpr':
        // Return type of last statement
        return tAny;
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
    const scheme = this.env.get(expr.name);
    if (scheme) {
      return this.instantiate(scheme);
    }
    if (this.strictMode) {
      this.error(`Undefined variable: ${expr.name}`, expr.span);
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
      case '^':
        if (this.isNumber(leftType) && this.isNumber(rightType)) {
          return tNumber;
        }
        if (expr.operator === '+' && (this.isString(leftType) || this.isString(rightType))) {
          return tString;
        }
        if (this.strictMode) {
          this.error(`Operator '${expr.operator}' requires numbers, got ${typeToString(leftType)} and ${typeToString(rightType)}`, expr.span);
        }
        return tNumber;

      case '==':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
        return tBool;

      case '&&':
      case '||':
        return tBool;

      case '&':
      case '|':
        if (this.isNumber(leftType) && this.isNumber(rightType)) {
          return tNumber;
        }
        return tNumber;

      case '..':
        return tString;

      case '??':
        return this.unify(leftType, rightType) ? leftType : tUnion(leftType, rightType);

      default:
        return tAny;
    }
  }

  private inferUnary(expr: AST.UnaryExpr): Type {
    const operandType = this.inferExpression(expr.operand);

    switch (expr.operator) {
      case '-':
        if (this.isNumber(operandType)) return tNumber;
        if (this.strictMode) {
          this.error(`Unary '-' requires number, got ${typeToString(operandType)}`, expr.span);
        }
        return tNumber;
      case '!':
      case 'not':
        return tBool;
      case '~':
        return tNumber;
      case '#':
        return tNumber;
      case 'ref':
        return { kind: TypeKind.Ref, inner: operandType } as Type;
      case 'mut':
        return { kind: TypeKind.Mut, inner: operandType } as Type;
      default:
        return operandType;
    }
  }

  private inferTernary(expr: AST.TernaryExpr): Type {
    const condType = this.inferExpression(expr.condition);
    if (!this.isBoolLike(condType) && this.strictMode) {
      this.error(`Ternary condition must be boolean`, expr.condition.span);
    }
    const thenType = this.inferExpression(expr.thenExpr);
    const elseType = this.inferExpression(expr.elseExpr);
    return this.unify(thenType, elseType) ? thenType : tUnion(thenType, elseType);
  }

  private inferCall(expr: AST.CallExpr): Type {
    const calleeType = this.inferExpression(expr.callee);

    if (calleeType.kind === TypeKind.Function) {
      const fn = calleeType as Types.FunctionType;

      // Check argument count
      const requiredParams = fn.params.filter(p => !p.isOptional && !p.isRest).length;
      if (expr.args.length < requiredParams) {
        this.error(`Too few arguments: expected ${fn.params.length}, got ${expr.args.length}`, expr.span);
      }

      // Check argument types
      for (let i = 0; i < Math.min(expr.args.length, fn.params.length); i++) {
        const argType = this.inferExpression(expr.args[i].value);
        const paramType = fn.params[i].type;
        if (!this.unify(argType, paramType) && this.strictMode) {
          this.error(
            `Argument ${i + 1} type mismatch: expected ${typeToString(paramType)}, got ${typeToString(argType)}`,
            expr.args[i].span
          );
        }
      }

      return fn.returnType;
    }

    if (calleeType.kind === TypeKind.Any) {
      return tAny;
    }

    if (this.strictMode) {
      this.error(`Cannot call non-function type: ${typeToString(calleeType)}`, expr.span);
    }
    return tAny;
  }

  private inferMember(expr: AST.MemberExpr): Type {
    const objType = this.inferExpression(expr.object);

    if (objType.kind === TypeKind.Struct) {
      const struct = objType as Types.StructType;
      const fieldType = struct.fields.get(expr.property);
      if (fieldType) return fieldType;
      const methodType = struct.methods.get(expr.property);
      if (methodType) return methodType;
    }

    if (objType.kind === TypeKind.Table) {
      const tbl = objType as Types.TableType;
      return tbl.valueType;
    }

    if (objType.kind === TypeKind.String && expr.property === 'length') {
      return tNumber;
    }

    if (objType.kind === TypeKind.Any) {
      return tAny;
    }

    if (this.strictMode) {
      this.error(`Property '${expr.property}' does not exist on ${typeToString(objType)}`, expr.span);
    }
    return tAny;
  }

  private inferIndex(expr: AST.IndexExpr): Type {
    const objType = this.inferExpression(expr.object);
    const idxType = this.inferExpression(expr.index);

    if (objType.kind === TypeKind.Array) {
      const arr = objType as Types.ArrayType;
      return arr.elementType;
    }

    if (objType.kind === TypeKind.Table) {
      const tbl = objType as Types.TableType;
      return tbl.valueType;
    }

    if (objType.kind === TypeKind.String) {
      return tString;
    }

    if (objType.kind === TypeKind.Any) {
      return tAny;
    }

    if (this.strictMode) {
      this.error(`Cannot index ${typeToString(objType)}`, expr.span);
    }
    return tAny;
  }

  private inferAssignment(expr: AST.AssignmentExpr): Type {
    const valueType = this.inferExpression(expr.value);

    if (expr.target.kind === 'Identifier') {
      const name = (expr.target as AST.Identifier).name;
      const existing = this.env.get(name);
      if (existing) {
        const existingType = this.instantiate(existing);
        if (!this.unify(valueType, existingType) && this.strictMode) {
          this.error(
            `Cannot assign ${typeToString(valueType)} to ${typeToString(existingType)}`,
            expr.span
          );
        }
        return existingType;
      }
      // New variable
      this.env.set(name, { vars: [], type: valueType });
      return valueType;
    }

    return valueType;
  }

  private inferLambda(expr: AST.LambdaExpr): Type {
    const paramTypes = expr.params.map(p => ({
      name: p.name,
      type: p.type ? this.typeFromExpr(p.type) : tAny,
      isOptional: p.defaultValue !== null,
      isRest: false
    }));

    const oldEnv = this.env;
    this.env = this.env.child();
    for (const param of expr.params) {
      const pType = param.type ? this.typeFromExpr(param.type) : tAny;
      this.env.set(param.name, { vars: [], type: pType });
    }

    let returnType: Type;
    if (expr.body.kind === 'Block') {
      this.inferBlock(expr.body as AST.Block);
      returnType = tNil; // Simplified
    } else {
      returnType = this.inferExpression(expr.body as AST.Expression);
    }

    this.env = oldEnv;

    return tFunction(paramTypes, returnType, expr.isAsync);
  }

  private inferArray(expr: AST.ArrayExpr): Type {
    if (expr.elements.length === 0) {
      return tArray(tAny);
    }

    const elemTypes = expr.elements.map(e => this.inferExpression(e));
    const unified = elemTypes.reduce((a, b) => this.unify(a, b) ? a : tUnion(a, b));
    return tArray(unified);
  }

  private inferTable(expr: AST.TableExpr): Type {
    if (expr.entries.length === 0) {
      return tTable(tAny, tAny);
    }

    const keyTypes = expr.entries.map(e => 
      typeof e.key === 'string' ? tString : this.inferExpression(e.key as AST.Expression)
    );
    const valueTypes = expr.entries.map(e => this.inferExpression(e.value));

    const unifiedKey = keyTypes.reduce((a, b) => this.unify(a, b) ? a : tUnion(a, b));
    const unifiedValue = valueTypes.reduce((a, b) => this.unify(a, b) ? a : tUnion(a, b));

    return tTable(unifiedKey, unifiedValue);
  }

  private inferTuple(expr: AST.TupleExpr): Type {
    const types = expr.elements.map(e => this.inferExpression(e));
    return { kind: TypeKind.Tuple, elements: types } as Type;
  }

  private inferAwait(expr: AST.AwaitExpr): Type {
    const innerType = this.inferExpression(expr.expression);
    // Unwrap Promise/Result
    if (innerType.kind === TypeKind.Generic) {
      const gen = innerType as Types.GenericType;
      if (gen.args.length > 0) return gen.args[0];
    }
    return innerType;
  }

  private inferTry(expr: AST.TryExpr): Type {
    const tryType = this.inferExpression(expr.expression);
    if (expr.catchBody) {
      const oldEnv = this.env;
      this.env = this.env.child();
      if (expr.catchVar) {
        this.env.set(expr.catchVar, { vars: [], type: tString });
      }
      this.inferBlock(expr.catchBody);
      this.env = oldEnv;
    }
    return tryType;
  }

  private inferPattern(pattern: AST.Pattern): Type {
    switch (pattern.kind) {
      case 'LiteralPattern':
        return this.inferLiteral(pattern.value as AST.Literal);
      case 'VariablePattern':
        return this.freshVar();
      case 'WildcardPattern':
        return tAny;
      case 'ArrayPattern':
        return tArray(this.freshVar());
      case 'StructPattern':
        return tNamed(pattern.name);
      case 'EnumPattern':
        return tNamed(pattern.enumName);
      case 'RestPattern':
        return tArray(this.freshVar());
      default:
        return tAny;
    }
  }

  private typeFromExpr(expr: AST.TypeExpr): Type {
    switch (expr.kind) {
      case 'NamedType':
        return tNamed((expr as AST.NamedType).name);
      case 'GenericType':
        const gen = expr as AST.GenericType;
        return tGeneric(gen.name, gen.args.map(a => this.typeFromExpr(a)));
      case 'FunctionType':
        const fn = expr as AST.FunctionType;
        return tFunction(
          fn.params.map((p, i) => ({ name: `arg${i}`, type: this.typeFromExpr(p), isOptional: false, isRest: false })),
          this.typeFromExpr(fn.returnType)
        );
      case 'ArrayType':
        return tArray(this.typeFromExpr((expr as AST.ArrayType).element));
      case 'TableType':
        const tbl = expr as AST.TableType;
        return tTable(this.typeFromExpr(tbl.key), this.typeFromExpr(tbl.value));
      case 'OptionalType':
        return tOptional(this.typeFromExpr((expr as AST.OptionalType).inner));
      case 'UnionType':
        const un = expr as AST.UnionType;
        return un.types.reduce((a, b) => tUnion(a, this.typeFromExpr(b)));
      case 'IntersectionType':
        return tAny;
      case 'RefType':
        return { kind: TypeKind.Ref, inner: this.typeFromExpr((expr as AST.RefType).inner) } as Type;
      case 'MutType':
        return { kind: TypeKind.Mut, inner: this.typeFromExpr((expr as AST.MutType).inner) } as Type;
      case 'SelfType':
        return { kind: TypeKind.Self } as Type;
      case 'WildcardType':
        return this.freshVar();
      case 'LiteralType':
        const lit = (expr as AST.LiteralType).value;
        return this.inferLiteral(lit);
      default:
        return tAny;
    }
  }

  // Type unification
  private unify(a: Type, b: Type): boolean {
    if (a.kind === TypeKind.Any || b.kind === TypeKind.Any) return true;
    if (a.kind === TypeKind.Unknown || b.kind === TypeKind.Unknown) return true;
    if (a.kind === TypeKind.Nil && b.kind === TypeKind.Nil) return true;
    if (a.kind === TypeKind.Bool && b.kind === TypeKind.Bool) return true;
    if (a.kind === TypeKind.Number && b.kind === TypeKind.Number) return true;
    if (a.kind === TypeKind.String && b.kind === TypeKind.String) return true;
    if (a.kind === b.kind) {
      // Deep comparison for complex types
      return true; // Simplified
    }
    return false;
  }

  private isBoolLike(type: Type): boolean {
    return type.kind === TypeKind.Bool || type.kind === TypeKind.Any;
  }

  private isNumber(type: Type): boolean {
    return type.kind === TypeKind.Number || type.kind === TypeKind.Any;
  }

  private isString(type: Type): boolean {
    return type.kind === TypeKind.String || type.kind === TypeKind.Any;
  }

  private getElementType(type: Type): Type {
    if (type.kind === TypeKind.Array) {
      return (type as Types.ArrayType).elementType;
    }
    if (type.kind === TypeKind.String) {
      return tString;
    }
    if (type.kind === TypeKind.Table) {
      return (type as Types.TableType).valueType;
    }
    return tAny;
  }

  private freshVar(): Type {
    return { kind: TypeKind.Unknown } as Type; // Simplified
  }

  private freeVars(type: Type): TypeVariable[] {
    return []; // Simplified
  }

  private instantiate(scheme: Scheme): Type {
    return scheme.type; // Simplified - should substitute type variables
  }

  private error(message: string, span: AST.Span): void {
    this.errors.push({ message, span });
  }
}

export function typeCheck(program: AST.Program, strict: boolean = false): TypeError[] {
  return new TypeChecker(strict).check(program);
  }
