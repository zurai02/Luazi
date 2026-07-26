// Luazi AST Definitions
// Immutable tree structure with visitor pattern support

export type Node =
  | Program
  | Block
  | VarDecl
  | FnDecl
  | IfStmt
  | WhileStmt
  | ForStmt
  | ForInStmt
  | MatchStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ExprStmt
  | StructDecl
  | EnumDecl
  | TraitDecl
  | ImplDecl
  | ImportDecl
  | ExportDecl
  | DeferStmt
  | GuardStmt
  | Expression;

export interface Program {
  kind: 'Program';
  body: Statement[];
  sourceFile: string;
}

export type Statement =
  | Block
  | VarDecl
  | FnDecl
  | IfStmt
  | WhileStmt
  | ForStmt
  | ForInStmt
  | MatchStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ExprStmt
  | StructDecl
  | EnumDecl
  | TraitDecl
  | ImplDecl
  | ImportDecl
  | ExportDecl
  | DeferStmt
  | GuardStmt;

export interface Block {
  kind: 'Block';
  statements: Statement[];
  span: Span;
}

export interface VarDecl {
  kind: 'VarDecl';
  name: string;
  isConst: boolean;
  isMut: boolean;
  typeAnnotation: TypeExpr | null;
  initializer: Expression | null;
  span: Span;
}

export interface FnDecl {
  kind: 'FnDecl';
  name: string;
  isAsync: boolean;
  isPub: boolean;
  generics: GenericParam[];
  params: Param[];
  returnType: TypeExpr | null;
  body: Block;
  span: Span;
}

export interface Param {
  name: string;
  type: TypeExpr | null;
  defaultValue: Expression | null;
  isRef: boolean;
  isMut: boolean;
  span: Span;
}

export interface IfStmt {
  kind: 'If';
  condition: Expression;
  thenBranch: Block;
  elseBranch: Block | IfStmt | null;
  span: Span;
}

export interface WhileStmt {
  kind: 'While';
  condition: Expression;
  body: Block;
  span: Span;
}

export interface ForStmt {
  kind: 'For';
  init: VarDecl | ExprStmt | null;
  condition: Expression | null;
  increment: Expression | null;
  body: Block;
  span: Span;
}

export interface ForInStmt {
  kind: 'ForIn';
  varName: string;
  isConst: boolean;
  iterable: Expression;
  body: Block;
  span: Span;
}

export interface MatchStmt {
  kind: 'Match';
  expression: Expression;
  arms: MatchArm[];
  span: Span;
}

export interface MatchArm {
  pattern: Pattern;
  guard: Expression | null;
  body: Expression | Block;
  span: Span;
}

export type Pattern =
  | LiteralPattern
  | VariablePattern
  | ArrayPattern
  | StructPattern
  | EnumPattern
  | WildcardPattern
  | RestPattern;

export interface LiteralPattern { kind: 'LiteralPattern'; value: Literal; span: Span; }
export interface VariablePattern { kind: 'VariablePattern'; name: string; span: Span; }
export interface ArrayPattern { kind: 'ArrayPattern'; elements: Pattern[]; rest: Pattern | null; span: Span; }
export interface StructPattern { kind: 'StructPattern'; name: string; fields: [string, Pattern][]; span: Span; }
export interface EnumPattern { kind: 'EnumPattern'; enumName: string; variant: string; fields: Pattern[]; span: Span; }
export interface WildcardPattern { kind: 'WildcardPattern'; span: Span; }
export interface RestPattern { kind: 'RestPattern'; name: string | null; span: Span; }

export interface ReturnStmt {
  kind: 'Return';
  value: Expression | null;
  span: Span;
}

export interface BreakStmt { kind: 'Break'; label: string | null; span: Span; }
export interface ContinueStmt { kind: 'Continue'; label: string | null; span: Span; }

export interface ExprStmt {
  kind: 'ExprStmt';
  expression: Expression;
  span: Span;
}

export interface StructDecl {
  kind: 'StructDecl';
  name: string;
  isPub: boolean;
  generics: GenericParam[];
  fields: StructField[];
  methods: FnDecl[];
  span: Span;
}

export interface StructField {
  name: string;
  type: TypeExpr;
  defaultValue: Expression | null;
  isPub: boolean;
  span: Span;
}

export interface EnumDecl {
  kind: 'EnumDecl';
  name: string;
  isPub: boolean;
  generics: GenericParam[];
  variants: EnumVariant[];
  span: Span;
}

export interface EnumVariant {
  name: string;
  fields: EnumField[];
  discriminant: number | null;
  span: Span;
}

export interface EnumField {
  name: string | null;
  type: TypeExpr;
  span: Span;
}

export interface TraitDecl {
  kind: 'TraitDecl';
  name: string;
  isPub: boolean;
  generics: GenericParam[];
  methods: FnSignature[];
  associatedTypes: string[];
  span: Span;
}

export interface FnSignature {
  name: string;
  generics: GenericParam[];
  params: Param[];
  returnType: TypeExpr | null;
  span: Span;
}

export interface ImplDecl {
  kind: 'ImplDecl';
  target: TypeExpr;
  trait: TypeExpr | null;
  generics: GenericParam[];
  methods: FnDecl[];
  span: Span;
}

export interface ImportDecl {
  kind: 'Import';
  path: string;
  items: ImportItem[] | null;
  alias: string | null;
  span: Span;
}

export interface ImportItem {
  name: string;
  alias: string | null;
  isType: boolean;
  span: Span;
}

export interface ExportDecl {
  kind: 'Export';
  declaration: Statement;
  span: Span;
}

export interface DeferStmt {
  kind: 'Defer';
  expression: Expression;
  span: Span;
}

export interface GuardStmt {
  kind: 'Guard';
  condition: Expression;
  elseBranch: Block;
  span: Span;
}

export interface GenericParam {
  name: string;
  bounds: TypeExpr[];
  defaultType: TypeExpr | null;
  span: Span;
}

// ============================================================================
// EXPRESSIONS
// ============================================================================

export type Expression =
  | Literal
  | Identifier
  | BinaryExpr
  | UnaryExpr
  | TernaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | AssignmentExpr
  | LambdaExpr
  | ArrayExpr
  | TableExpr
  | TupleExpr
  | RangeExpr
  | SpreadExpr
  | AwaitExpr
  | YieldExpr
  | TryExpr
  | TypeCastExpr
  | TypeCheckExpr
  | BlockExpr;

export interface Literal {
  kind: 'Literal';
  value: string | number | boolean | null;
  raw: string;
  span: Span;
}

export interface Identifier {
  kind: 'Identifier';
  name: string;
  span: Span;
}

export interface BinaryExpr {
  kind: 'Binary';
  left: Expression;
  operator: BinaryOperator;
  right: Expression;
  span: Span;
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%' | '**'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | '&&' | '||'
  | '&' | '|' | '^' | '<<' | '>>'
  | '..' | '??'
  | '+=' | '-=' | '*=' | '/=' | '%=';

export interface UnaryExpr {
  kind: 'Unary';
  operator: UnaryOperator;
  operand: Expression;
  span: Span;
}

export type UnaryOperator = '-' | '!' | '~' | '#' | 'ref' | 'mut' | 'unsafe';

export interface TernaryExpr {
  kind: 'Ternary';
  condition: Expression;
  thenExpr: Expression;
  elseExpr: Expression;
  span: Span;
}

export interface CallExpr {
  kind: 'Call';
  callee: Expression;
  args: Argument[];
  isAsync: boolean;
  isTail: boolean;
  span: Span;
}

export interface Argument {
  name: string | null;
  value: Expression;
  isSpread: boolean;
  span: Span;
}

export interface MemberExpr {
  kind: 'Member';
  object: Expression;
  property: string;
  isOptional: boolean;
  span: Span;
}

export interface IndexExpr {
  kind: 'Index';
  object: Expression;
  index: Expression;
  isOptional: boolean;
  span: Span;
}

export interface AssignmentExpr {
  kind: 'Assignment';
  target: Expression;
  operator: '=' | '+=' | '-=' | '*=' | '/=';
  value: Expression;
  span: Span;
}

export interface LambdaExpr {
  kind: 'Lambda';
  params: Param[];
  returnType: TypeExpr | null;
  body: Block | Expression;
  isAsync: boolean;
  span: Span;
}

export interface ArrayExpr {
  kind: 'Array';
  elements: Expression[];
  span: Span;
}

export interface TableExpr {
  kind: 'Table';
  entries: TableEntry[];
  span: Span;
}

export interface TableEntry {
  key: Expression | string;
  value: Expression;
  isComputed: boolean;
  span: Span;
}

export interface TupleExpr {
  kind: 'Tuple';
  elements: Expression[];
  span: Span;
}

export interface RangeExpr {
  kind: 'Range';
  start: Expression | null;
  end: Expression | null;
  inclusive: boolean;
  span: Span;
}

export interface SpreadExpr {
  kind: 'Spread';
  expression: Expression;
  span: Span;
}

export interface AwaitExpr {
  kind: 'Await';
  expression: Expression;
  span: Span;
}

export interface YieldExpr {
  kind: 'Yield';
  expression: Expression | null;
  span: Span;
}

export interface TryExpr {
  kind: 'Try';
  expression: Expression;
  catchVar: string | null;
  catchBody: Block | null;
  finallyBody: Block | null;
  span: Span;
}

export interface TypeCastExpr {
  kind: 'TypeCast';
  expression: Expression;
  targetType: TypeExpr;
  isSafe: boolean;
  span: Span;
}

export interface TypeCheckExpr {
  kind: 'TypeCheck';
  expression: Expression;
  checkType: TypeExpr;
  span: Span;
}

export interface BlockExpr {
  kind: 'BlockExpr';
  block: Block;
  span: Span;
}

// ============================================================================
// TYPE EXPRESSIONS
// ============================================================================

export type TypeExpr =
  | NamedType
  | GenericType
  | FunctionType
  | TupleType
  | ArrayType
  | TableType
  | OptionalType
  | UnionType
  | IntersectionType
  | RefType
  | MutType
  | SelfType
  | WildcardType
  | LiteralType;

export interface NamedType { kind: 'NamedType'; name: string; span: Span; }
export interface GenericType { kind: 'GenericType'; name: string; args: TypeExpr[]; span: Span; }
export interface FunctionType { kind: 'FunctionType'; params: TypeExpr[]; returnType: TypeExpr; span: Span; }
export interface TupleType { kind: 'TupleType'; elements: TypeExpr[]; span: Span; }
export interface ArrayType { kind: 'ArrayType'; element: TypeExpr; span: Span; }
export interface TableType { kind: 'TableType'; key: TypeExpr; value: TypeExpr; span: Span; }
export interface OptionalType { kind: 'OptionalType'; inner: TypeExpr; span: Span; }
export interface UnionType { kind: 'UnionType'; types: TypeExpr[]; span: Span; }
export interface IntersectionType { kind: 'IntersectionType'; types: TypeExpr[]; span: Span; }
export interface RefType { kind: 'RefType'; inner: TypeExpr; span: Span; }
export interface MutType { kind: 'MutType'; inner: TypeExpr; span: Span; }
export interface SelfType { kind: 'SelfType'; span: Span; }
export interface WildcardType { kind: 'WildcardType'; span: Span; }
export interface LiteralType { kind: 'LiteralType'; value: Literal; span: Span; }

// ============================================================================
// SPAN (Source Location)
// ============================================================================

export interface Span {
  start: Position;
  end: Position;
  source: string;
}

export interface Position {
  line: number;
  column: number;
  offset: number;
}

// ============================================================================
// AST VISITOR
// ============================================================================

export interface Visitor<T> {
  visitProgram(node: Program): T;
  visitBlock(node: Block): T;
  visitVarDecl(node: VarDecl): T;
  visitFnDecl(node: FnDecl): T;
  visitIf(node: IfStmt): T;
  visitWhile(node: WhileStmt): T;
  visitFor(node: ForStmt): T;
  visitForIn(node: ForInStmt): T;
  visitMatch(node: MatchStmt): T;
  visitReturn(node: ReturnStmt): T;
  visitBreak(node: BreakStmt): T;
  visitContinue(node: ContinueStmt): T;
  visitExprStmt(node: ExprStmt): T;
  visitStructDecl(node: StructDecl): T;
  visitEnumDecl(node: EnumDecl): T;
  visitTraitDecl(node: TraitDecl): T;
  visitImplDecl(node: ImplDecl): T;
  visitImport(node: ImportDecl): T;
  visitExport(node: ExportDecl): T;
  visitDefer(node: DeferStmt): T;
  visitGuard(node: GuardStmt): T;

  visitLiteral(node: Literal): T;
  visitIdentifier(node: Identifier): T;
  visitBinary(node: BinaryExpr): T;
  visitUnary(node: UnaryExpr): T;
  visitTernary(node: TernaryExpr): T;
  visitCall(node: CallExpr): T;
  visitMember(node: MemberExpr): T;
  visitIndex(node: IndexExpr): T;
  visitAssignment(node: AssignmentExpr): T;
  visitLambda(node: LambdaExpr): T;
  visitArray(node: ArrayExpr): T;
  visitTable(node: TableExpr): T;
  visitTuple(node: TupleExpr): T;
  visitRange(node: RangeExpr): T;
  visitSpread(node: SpreadExpr): T;
  visitAwait(node: AwaitExpr): T;
  visitYield(node: YieldExpr): T;
  visitTry(node: TryExpr): T;
  visitTypeCast(node: TypeCastExpr): T;
  visitTypeCheck(node: TypeCheckExpr): T;
  visitBlockExpr(node: BlockExpr): T;
}

export function createSpan(startLine: number, startCol: number, endLine: number, endCol: number, source: string = ''): Span {
  return {
    start: { line: startLine, column: startCol, offset: 0 },
    end: { line: endLine, column: endCol, offset: 0 },
    source
  };
}
