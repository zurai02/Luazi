// Luazi Tokenizer
// Single-pass scanner with look-ahead and full Unicode support

export interface Token {
  type: TokenType;
  value: string;
  raw: string;
  span: Span;
}

export interface Span {
  line: number;
  column: number;
  offset: number;
  length: number;
  source: string;
}

export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  IDENTIFIER = 'IDENTIFIER',
  TEMPLATE = 'TEMPLATE',

  // Keywords
  LET = 'let',
  CONST = 'const',
  VAR = 'var',
  MUT = 'mut',
  FN = 'fn',
  ASYNC = 'async',
  AWAIT = 'await',
  RETURN = 'return',
  YIELD = 'yield',
  IF = 'if',
  ELSE = 'else',
  WHILE = 'while',
  FOR = 'for',
  IN = 'in',
  BREAK = 'break',
  CONTINUE = 'continue',
  MATCH = 'match',
  TRY = 'try',
  CATCH = 'catch',
  FINALLY = 'finally',
  THROW = 'throw',
  DEFER = 'defer',
  GUARD = 'guard',
  LOOP = 'loop',
  TYPE = 'type',
  STRUCT = 'struct',
  ENUM = 'enum',
  TRAIT = 'trait',
  IMPL = 'impl',
  WHERE = 'where',
  PUB = 'pub',
  PRIV = 'priv',
  REF = 'ref',
  UNSAFE = 'unsafe',
  IMPORT = 'import',
  EXPORT = 'export',
  FROM = 'from',
  AS = 'as',
  IS = 'is',
  SELF = 'self',
  SUPER = 'super',
  NIL = 'nil',
  TRUE = 'true',
  FALSE = 'false',
  AND = 'and',
  OR = 'or',
  NOT = 'not',

  // Operators
  PLUS = '+',
  MINUS = '-',
  STAR = '*',
  SLASH = '/',
  PERCENT = '%',
  CARET = '^',
  BANG = '!',
  TILDE = '~',
  AMPERSAND = '&',
  PIPE = '|',
  HASH = '#',
  QUESTION = '?',
  AT = '@',
  DOLLAR = '$',

  // Compound operators
  PLUS_EQ = '+=',
  MINUS_EQ = '-=',
  STAR_EQ = '*=',
  SLASH_EQ = '/=',
  PERCENT_EQ = '%=',
  CARET_EQ = '^=',
  AMPERSAND_EQ = '&=',
  PIPE_EQ = '|=',

  // Comparison
  EQ = '==',
  NEQ = '!=',
  LT = '<',
  LE = '<=',
  GT = '>',
  GE = '>=',

  // Assignment
  ASSIGN = '=',

  // Arrows
  FAT_ARROW = '=>',
  THIN_ARROW = '->',

  // Delimiters
  LPAREN = '(',
  RPAREN = ')',
  LBRACE = '{',
  RBRACE = '}',
  LBRACKET = '[',
  RBRACKET = ']',
  COLON = ':',
  DOUBLE_COLON = '::',
  SEMICOLON = ';',
  COMMA = ',',
  DOT = '.',
  ELLIPSIS = '...',
  OPTIONAL_CHAIN = '?.',
  NULL_COALESCE = '??',
  RANGE = '..',
  RANGE_INCLUSIVE = '..=',

  // Special
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
  COMMENT = 'COMMENT',
  DOC_COMMENT = 'DOC_COMMENT',
  UNKNOWN = 'UNKNOWN'
}

const KEYWORDS: Record<string, TokenType> = {
  let: TokenType.LET,
  const: TokenType.CONST,
  var: TokenType.VAR,
  mut: TokenType.MUT,
  fn: TokenType.FN,
  async: TokenType.ASYNC,
  await: TokenType.AWAIT,
  return: TokenType.RETURN,
  yield: TokenType.YIELD,
  if: TokenType.IF,
  else: TokenType.ELSE,
  while: TokenType.WHILE,
  for: TokenType.FOR,
  in: TokenType.IN,
  break: TokenType.BREAK,
  continue: TokenType.CONTINUE,
  match: TokenType.MATCH,
  try: TokenType.TRY,
  catch: TokenType.CATCH,
  finally: TokenType.FINALLY,
  throw: TokenType.THROW,
  defer: TokenType.DEFER,
  guard: TokenType.GUARD,
  loop: TokenType.LOOP,
  type: TokenType.TYPE,
  struct: TokenType.STRUCT,
  enum: TokenType.ENUM,
  trait: TokenType.TRAIT,
  impl: TokenType.IMPL,
  where: TokenType.WHERE,
  pub: TokenType.PUB,
  priv: TokenType.PRIV,
  ref: TokenType.REF,
  unsafe: TokenType.UNSAFE,
  import: TokenType.IMPORT,
  export: TokenType.EXPORT,
  from: TokenType.FROM,
  as: TokenType.AS,
  is: TokenType.IS,
  self: TokenType.SELF,
  super: TokenType.SUPER,
  nil: TokenType.NIL,
  true: TokenType.TRUE,
  false: TokenType.FALSE,
  and: TokenType.AND,
  or: TokenType.OR,
  not: TokenType.NOT,
};

export class Tokenizer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private startLine: number = 1;
  private startCol: number = 1;
  private startPos: number = 0;
  private tokens: Token[] = [];
  private indentStack: number[] = [0];
  private atLineStart: boolean = true;

  constructor(source: string, private fileName: string = '<stdin>') {
    this.source = source;
  }

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.startToken();
      this.scanToken();
    }

    this.tokens.push(this.makeToken(TokenType.EOF, ''));
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();

    // Whitespace and newlines
    if (c === ' ' || c === '\t') {
      if (this.atLineStart) {
        // Track indentation
      }
      return;
    }

    if (c === '\n' || c === '\r') {
      this.handleNewline();
      return;
    }

    this.atLineStart = false;

    // Comments
    if (c === '/' && this.peek() === '/') {
      this.readLineComment();
      return;
    }

    if (c === '/' && this.peek() === '*') {
      this.readBlockComment();
      return;
    }

    // Doc comments
    if (c === '/' && this.peek() === '*' && this.peek(1) === '*') {
      this.readDocComment();
      return;
    }

    // Numbers
    if (this.isDigit(c) || (c === '.' && this.isDigit(this.peek()))) {
      this.readNumber();
      return;
    }

    // Strings
    if (c === '"' || c === "'") {
      this.readString(c);
      return;
    }

    // Template strings
    if (c === '`') {
      this.readTemplate();
      return;
    }

    // Identifiers and keywords
    if (this.isAlpha(c) || c === '_') {
      this.readIdentifier();
      return;
    }

    // Multi-character operators
    switch (c) {
      case '+':
        this.addToken(this.match('=') ? TokenType.PLUS_EQ : TokenType.PLUS);
        return;
      case '-':
        if (this.match('>')) { this.addToken(TokenType.THIN_ARROW); return; }
        if (this.match('=')) { this.addToken(TokenType.MINUS_EQ); return; }
        this.addToken(TokenType.MINUS);
        return;
      case '*':
        this.addToken(this.match('=') ? TokenType.STAR_EQ : TokenType.STAR);
        return;
      case '/':
        this.addToken(this.match('=') ? TokenType.SLASH_EQ : TokenType.SLASH);
        return;
      case '%':
        this.addToken(this.match('=') ? TokenType.PERCENT_EQ : TokenType.PERCENT);
        return;
      case '^':
        this.addToken(this.match('=') ? TokenType.CARET_EQ : TokenType.CARET);
        return;
      case '&':
        this.addToken(this.match('=') ? TokenType.AMPERSAND_EQ : TokenType.AMPERSAND);
        return;
      case '|':
        this.addToken(this.match('=') ? TokenType.PIPE_EQ : TokenType.PIPE);
        return;
      case '=':
        this.addToken(this.match('>') ? TokenType.FAT_ARROW : this.match('=') ? TokenType.EQ : TokenType.ASSIGN);
        return;
      case '!':
        this.addToken(this.match('=') ? TokenType.NEQ : TokenType.BANG);
        return;
      case '<':
        this.addToken(this.match('=') ? TokenType.LE : TokenType.LT);
        return;
      case '>':
        this.addToken(this.match('=') ? TokenType.GE : TokenType.GT);
        return;
      case ':':
        this.addToken(this.match(':') ? TokenType.DOUBLE_COLON : TokenType.COLON);
        return;
      case '.':
        if (this.match('.')) {
          this.addToken(this.match('=') ? TokenType.RANGE_INCLUSIVE : TokenType.RANGE);
          return;
        }
        if (this.match('?')) { this.addToken(TokenType.OPTIONAL_CHAIN); return; }
        this.addToken(TokenType.DOT);
        return;
      case '?':
        if (this.match('?')) { this.addToken(TokenType.NULL_COALESCE); return; }
        if (this.match('.')) { this.addToken(TokenType.OPTIONAL_CHAIN); return; }
        this.addToken(TokenType.QUESTION);
        return;
    }

    // Single-character tokens
    const singleCharTokens: Record<string, TokenType> = {
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      ';': TokenType.SEMICOLON,
      ',': TokenType.COMMA,
      '~': TokenType.TILDE,
      '#': TokenType.HASH,
      '@': TokenType.AT,
      '$': TokenType.DOLLAR,
    };

    if (singleCharTokens[c]) {
      this.addToken(singleCharTokens[c]);
      return;
    }

    // Unknown character
    this.addToken(TokenType.UNKNOWN);
  }

  private readNumber(): void {
    let isFloat = false;
    let isHex = false;
    let isBin = false;
    let isOct = false;

    if (this.peek(-1) === '0') {
      const next = this.peek();
      if (next === 'x' || next === 'X') { isHex = true; this.advance(); }
      else if (next === 'b' || next === 'B') { isBin = true; this.advance(); }
      else if (next === 'o' || next === 'O') { isOct = true; this.advance(); }
    }

    while (!this.isAtEnd()) {
      const c = this.peek();
      if (isHex && this.isHexDigit(c)) { this.advance(); continue; }
      if (isBin && (c === '0' || c === '1')) { this.advance(); continue; }
      if (isOct && c >= '0' && c <= '7') { this.advance(); continue; }
      if (this.isDigit(c)) { this.advance(); continue; }
      if (c === '.' && !isFloat && this.isDigit(this.peek(1))) {
        isFloat = true;
        this.advance();
        continue;
      }
      if ((c === 'e' || c === 'E') && (this.isDigit(this.peek(1)) || this.peek(1) === '-' || this.peek(1) === '+')) {
        isFloat = true;
        this.advance();
        if (this.peek() === '-' || this.peek() === '+') this.advance();
        continue;
      }
      if (c === '_') { this.advance(); continue; } // Number separators
      break;
    }

    this.addToken(TokenType.NUMBER);
  }

  private readString(quote: string): void {
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // skip backslash
        if (!this.isAtEnd()) this.advance(); // skip escaped char
      } else {
        this.advance();
      }
    }

    if (!this.isAtEnd()) {
      this.advance(); // closing quote
    }

    this.addToken(TokenType.STRING);
  }

  private readTemplate(): void {
    while (!this.isAtEnd() && this.peek() !== '`') {
      if (this.peek() === '$' && this.peek(1) === '{') {
        // Template interpolation - handled by parser
        this.addToken(TokenType.TEMPLATE);
        return;
      }
      this.advance();
    }
    if (!this.isAtEnd()) this.advance();
    this.addToken(TokenType.TEMPLATE);
  }

  private readIdentifier(): void {
    while (!this.isAtEnd() && (this.isAlphaNum(this.peek()) || this.peek() === '_')) {
      this.advance();
    }

    const text = this.source.substring(this.startPos, this.pos);
    const type = KEYWORDS[text] || TokenType.IDENTIFIER;
    this.addToken(type);
  }

  private readLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
    this.addToken(TokenType.COMMENT);
  }

  private readBlockComment(): void {
    let depth = 1;
    while (!this.isAtEnd() && depth > 0) {
      if (this.peek() === '/' && this.peek(1) === '*') {
        depth++;
        this.advance();
        this.advance();
      } else if (this.peek() === '*' && this.peek(1) === '/') {
        depth--;
        this.advance();
        this.advance();
      } else {
        this.advance();
      }
    }
    this.addToken(TokenType.COMMENT);
  }

  private readDocComment(): void {
    while (!this.isAtEnd() && !(this.peek() === '*' && this.peek(1) === '/')) {
      this.advance();
    }
    if (!this.isAtEnd()) { this.advance(); this.advance(); }
    this.addToken(TokenType.DOC_COMMENT);
  }

  private handleNewline(): void {
    this.line++;
    this.column = 1;
    this.atLineStart = true;
  }

  // Helper methods
  private startToken(): void {
    this.startLine = this.line;
    this.startCol = this.column;
    this.startPos = this.pos - 1;
  }

  private advance(): string {
    const c = this.source[this.pos];
    this.pos++;
    this.column++;
    return c;
  }

  private peek(offset: number = 0): string {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx] : '\0';
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.pos] !== expected) return false;
    this.pos++;
    this.column++;
    return true;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isHexDigit(c: string): boolean {
    return this.isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  }

  private isAlphaNum(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private addToken(type: TokenType): void {
    this.tokens.push(this.makeToken(type, this.source.substring(this.startPos, this.pos)));
  }

  private makeToken(type: TokenType, value: string): Token {
    return {
      type,
      value,
      raw: value,
      span: {
        line: this.startLine,
        column: this.startCol,
        offset: this.startPos,
        length: this.pos - this.startPos,
        source: this.fileName
      }
    };
  }
}

export function tokenize(source: string, fileName?: string): Token[] {
  return new Tokenizer(source, fileName).tokenize();
  }
