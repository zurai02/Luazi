// Luazi Type System Definitions
// Runtime type representation for the type checker

export enum TypeKind {
  Unknown = 'Unknown',
  Never = 'Never',
  Any = 'Any',
  Nil = 'Nil',
  Bool = 'Bool',
  Number = 'Number',
  String = 'String',
  Function = 'Function',
  Table = 'Table',
  Array = 'Array',
  Tuple = 'Tuple',
  Union = 'Union',
  Intersection = 'Intersection',
  Optional = 'Optional',
  Generic = 'Generic',
  Named = 'Named',
  Ref = 'Ref',
  Mut = 'Mut',
  Self = 'Self',
  Literal = 'Literal',
  Enum = 'Enum',
  Struct = 'Struct',
  Trait = 'Trait',
  UserData = 'UserData',
  Thread = 'Thread',
}

export interface Type {
  kind: TypeKind;
}

export interface UnknownType extends Type { kind: TypeKind.Unknown; }
export interface NeverType extends Type { kind: TypeKind.Never; }
export interface AnyType extends Type { kind: TypeKind.Any; }
export interface NilType extends Type { kind: TypeKind.Nil; }
export interface BoolType extends Type { kind: TypeKind.Bool; }
export interface NumberType extends Type { kind: TypeKind.Number; }
export interface StringType extends Type { kind: TypeKind.String; }

export interface FunctionType extends Type {
  kind: TypeKind.Function;
  params: ParamType[];
  returnType: Type;
  isAsync: boolean;
  isVariadic: boolean;
}

export interface ParamType {
  name: string;
  type: Type;
  isOptional: boolean;
  isRest: boolean;
}

export interface TableType extends Type {
  kind: TypeKind.Table;
  keyType: Type;
  valueType: Type;
}

export interface ArrayType extends Type {
  kind: TypeKind.Array;
  elementType: Type;
}

export interface TupleType extends Type {
  kind: TypeKind.Tuple;
  elements: Type[];
}

export interface UnionType extends Type {
  kind: TypeKind.Union;
  types: Type[];
}

export interface IntersectionType extends Type {
  kind: TypeKind.Intersection;
  types: Type[];
}

export interface OptionalType extends Type {
  kind: TypeKind.Optional;
  inner: Type;
}

export interface GenericType extends Type {
  kind: TypeKind.Generic;
  name: string;
  args: Type[];
}

export interface NamedType extends Type {
  kind: TypeKind.Named;
  name: string;
  module?: string;
}

export interface RefType extends Type {
  kind: TypeKind.Ref;
  inner: Type;
}

export interface MutType extends Type {
  kind: TypeKind.Mut;
  inner: Type;
}

export interface SelfType extends Type {
  kind: TypeKind.Self;
}

export interface LiteralType extends Type {
  kind: TypeKind.Literal;
  value: string | number | boolean;
}

export interface EnumType extends Type {
  kind: TypeKind.Enum;
  name: string;
  variants: EnumVariant[];
}

export interface EnumVariant {
  name: string;
  fields: Type[];
}

export interface StructType extends Type {
  kind: TypeKind.Struct;
  name: string;
  fields: Map<string, Type>;
  methods: Map<string, FunctionType>;
}

export interface TraitType extends Type {
  kind: TypeKind.Trait;
  name: string;
  methods: Map<string, FunctionType>;
}

export interface UserDataType extends Type {
  kind: TypeKind.UserData;
  name: string;
}

export interface ThreadType extends Type {
  kind: TypeKind.Thread;
}

// Type constructors
export const tUnknown: UnknownType = { kind: TypeKind.Unknown };
export const tNever: NeverType = { kind: TypeKind.Never };
export const tAny: AnyType = { kind: TypeKind.Any };
export const tNil: NilType = { kind: TypeKind.Nil };
export const tBool: BoolType = { kind: TypeKind.Bool };
export const tNumber: NumberType = { kind: TypeKind.Number };
export const tString: StringType = { kind: TypeKind.String };

export function tFunction(params: ParamType[], returnType: Type, isAsync: boolean = false): FunctionType {
  return { kind: TypeKind.Function, params, returnType, isAsync, isVariadic: false };
}

export function tArray(elementType: Type): ArrayType {
  return { kind: TypeKind.Array, elementType };
}

export function tTable(keyType: Type, valueType: Type): TableType {
  return { kind: TypeKind.Table, keyType, valueType };
}

export function tUnion(...types: Type[]): UnionType {
  return { kind: TypeKind.Union, types };
}

export function tOptional(inner: Type): OptionalType {
  return { kind: TypeKind.Optional, inner };
}

export function tGeneric(name: string, args: Type[]): GenericType {
  return { kind: TypeKind.Generic, name, args };
}

export function tNamed(name: string, module?: string): NamedType {
  return { kind: TypeKind.Named, name, module };
}

// Type display
export function typeToString(type: Type): string {
  switch (type.kind) {
    case TypeKind.Unknown: return 'unknown';
    case TypeKind.Never: return 'never';
    case TypeKind.Any: return 'any';
    case TypeKind.Nil: return 'nil';
    case TypeKind.Bool: return 'bool';
    case TypeKind.Number: return 'number';
    case TypeKind.String: return 'string';
    case TypeKind.Function: {
      const fn = type as FunctionType;
      const params = fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ');
      const ret = typeToString(fn.returnType);
      return `fn(${params}) -> ${ret}`;
    }
    case TypeKind.Array: {
      const arr = type as ArrayType;
      return `[${typeToString(arr.elementType)}]`;
    }
    case TypeKind.Table: {
      const tbl = type as TableType;
      return `{ ${typeToString(tbl.keyType)}: ${typeToString(tbl.valueType)} }`;
    }
    case TypeKind.Union: {
      const un = type as UnionType;
      return un.types.map(typeToString).join(' | ');
    }
    case TypeKind.Optional: {
      const opt = type as OptionalType;
      return `${typeToString(opt.inner)}?`;
    }
    case TypeKind.Generic: {
      const gen = type as GenericType;
      return `${gen.name}<${gen.args.map(typeToString).join(', ')}>`;
    }
    case TypeKind.Named: {
      const named = type as NamedType;
      return named.module ? `${named.module}.${named.name}` : named.name;
    }
    default:
      return type.kind.toString().toLowerCase();
  }
}
