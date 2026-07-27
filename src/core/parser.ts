// Luazi Parser
// Recursive descent with Pratt parsing for expressions
// Precedence climbing for binary operators

import { Token, TokenType, Span } from './tokenizer';
import * as AST from './ast';

export class ParseError extends Error {
  constructor(message: string, public span: Span) {
    super(`${message} at line ${span.line}, column ${span.column}`);
    this.name = 'ParseError';
  }
}

interface PrefixParselet {
  parse(parser: Parser, token: Token): AST.Expression;
}

interface InfixParselet {
  precedence: number;
  parse(parser: Parser, left: AST.Expression, token: Token): AST.Expression;
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private prefixParselets: Map<TokenType, PrefixParselet> = new Map();
  private infixParselets: Map<TokenType, InfixParselet> = new Map();

  // Loop stack for break/continue label resolution
  private loopStack: { label: string | null; startPos: number }[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.registerParselets();
  }

  private registerParselets(): void {
    // Prefix parselets
    this.prefix(TokenType.NUMBER, {
      parse: (_, t) => ({
        kind: 'Literal',
        value: parseFloat(t.value),
        raw: t.raw,
        span: t.span
      })
    });

    this.prefix(TokenType.STRING, {
      parse: (_, t) => ({
        kind: 'Literal',
        value: t.value.slice(1, -1),
        raw: t.raw,
        span: t.span
      })
    });

    this.prefix(TokenType.IDENTIFIER, {
      parse: (_, t) => ({
        kind: 'Identifier',
        name: t.value,
        span: t.span
      })
    });

    this.prefix(TokenType.NIL, {
      parse: (_, t) => ({
        kind: 'Literal',
        value: null,
        raw: t.raw,
        span: t.span
      })
    });

    this.prefix(TokenType.TRUE, {
      parse: (_, t) => ({
        kind: 'Literal',
        value: true,
        raw: t.raw,
        span: t.span
      })
    });

    this.prefix(TokenType.FALSE, {
      parse: (_, t) => ({
        kind: 'Literal',
        value: false,
        raw: t.raw,
        span: t.span
      })
    });

    this.prefix(TokenType.MINUS, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: '-',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.BANG, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: '!',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.NOT, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: '!',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.TILDE, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: '~',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.HASH, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: '#',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.REF, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: 'ref',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.MUT, {
      parse: (p, t) => ({
        kind: 'Unary',
        operator: 'mut',
        operand: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.UNSAFE, {
      parse: (p, t) => {
        const block = p.parseBlock();
        return {
          kind: 'BlockExpr',
          block,
          span: t.span
        };
      }
    });

    this.prefix(TokenType.YIELD, {
      parse: (p, t) => ({
        kind: 'Yield',
        expression: p.check(TokenType.NEWLINE) || p.check(TokenType.SEMICOLON) || p.check(TokenType.RBRACE) || p.isAtEnd()
          ? null
          : p.parseExpression(),
        span: t.span
      })
    });

    this.prefix(TokenType.LPAREN, {
      parse: (p, t) => {
        const expr = p.parseExpression();
        p.consume(TokenType.RPAREN, "Expected ')' after expression");
        return expr;
      }
    });

    this.prefix(TokenType.LBRACKET, {
      parse: (p, t) => {
        const elements: AST.Expression[] = [];
        if (!p.check(TokenType.RBRACKET)) {
          do {
            if (p.match(TokenType.ELLIPSIS)) {
              elements.push({
                kind: 'Spread',
                expression: p.parseExpression(),
                span: p.current().span
              });
            } else {
              elements.push(p.parseExpression());
            }
          } while (p.match(TokenType.COMMA));
        }
        p.consume(TokenType.RBRACKET, "Expected ']' after array elements");
        return {
          kind: 'Array',
          elements,
          span: t.span
        };
      }
    });

    this.prefix(TokenType.LBRACE, {
      parse: (p, t) => p.parseTableOrBlock()
    });

    this.prefix(TokenType.FN, {
      parse: (p, t) => p.parseLambda(t.span)
    });

    this.prefix(TokenType.ASYNC, {
      parse: (p, t) => {
        const lambda = p.parseLambda(t.span);
        return { ...lambda, isAsync: true };
      }
    });

    this.prefix(TokenType.AWAIT, {
      parse: (p, t) => ({
        kind: 'Await',
        expression: p.parseExpression(70),
        span: t.span
      })
    });

    this.prefix(TokenType.TRY, {
      parse: (p, t) => p.parseTryExpression(t.span)
    });

    this.prefix(TokenType.MATCH, {
      parse: (p, t) => p.parseMatchExpression(t.span)
    });

    this.prefix(TokenType.IF, {
      parse: (p, t) => p.parseTernary(t.span)
    });

    // Infix parselets
    this.infix(TokenType.PLUS, 50, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '+',
      right: p.parseExpression(50),
      span: t.span
    }));

    this.infix(TokenType.MINUS, 50, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '-',
      right: p.parseExpression(50),
      span: t.span
    }));

    this.infix(TokenType.STAR, 60, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '*',
      right: p.parseExpression(60),
      span: t.span
    }));

    this.infix(TokenType.SLASH, 60, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '/',
      right: p.parseExpression(60),
      span: t.span
    }));

    this.infix(TokenType.PERCENT, 60, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '%',
      right: p.parseExpression(60),
      span: t.span
    }));

    this.infix(TokenType.CARET, 70, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '**',
      right: p.parseExpression(69),
      span: t.span
    }));

    this.infix(TokenType.EQ, 40, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '==',
      right: p.parseExpression(40),
      span: t.span
    }));

    this.infix(TokenType.NEQ, 40, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '!=',
      right: p.parseExpression(40),
      span: t.span
    }));

    this.infix(TokenType.LT, 40, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '<',
      right: p.parseExpression(40),
      span: t.span
    }));

    this.infix(TokenType.LE, 40, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '<=',
      right: p.parseExpression(40),
      span: t.span
    }));

    this.infix(TokenType.GT, 40, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '>',
      right: p.parseExpression(40),
      span: t.span
    }));

    this.infix(TokenType.GE, 40, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '>=',
      right: p.parseExpression(40),
      span: t.span
    }));

    this.infix(TokenType.AND, 30, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '&&',
      right: p.parseExpression(30),
      span: t.span
    }));

    this.infix(TokenType.OR, 20, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '||',
      right: p.parseExpression(20),
      span: t.span
    }));

    this.infix(TokenType.AMPERSAND, 45, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '&',
      right: p.parseExpression(45),
      span: t.span
    }));

    this.infix(TokenType.PIPE, 35, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '|',
      right: p.parseExpression(35),
      span: t.span
    }));

    this.infix(TokenType.DOT, 80, (p, left, t) => {
      const prop = p.consume(TokenType.IDENTIFIER, "Expected property name after '.'");
      return {
        kind: 'Member',
        object: left,
        property: prop.value,
        isOptional: false,
        span: t.span
      };
    });

    this.infix(TokenType.OPTIONAL_CHAIN, 80, (p, left, t) => {
      const prop = p.consume(TokenType.IDENTIFIER, "Expected property name after '?.'");
      return {
        kind: 'Member',
        object: left,
        property: prop.value,
        isOptional: true,
        span: t.span
      };
    });

    this.infix(TokenType.LPAREN, 80, (p, left, t) => {
      const args: AST.Argument[] = [];
      if (!p.check(TokenType.RPAREN)) {
        do {
          const isSpread = p.match(TokenType.ELLIPSIS);
          const name = p.check(TokenType.IDENTIFIER) && p.peek(1).type === TokenType.ASSIGN
            ? p.advance().value
            : null;
          if (name) p.consume(TokenType.ASSIGN, "Expected '=' after named argument");
          args.push({
            name,
            value: p.parseExpression(),
            isSpread,
            span: t.span
          });
        } while (p.match(TokenType.COMMA));
      }
      p.consume(TokenType.RPAREN, "Expected ')' after arguments");
      return {
        kind: 'Call',
        callee: left,
        args,
        isAsync: false,
        isTail: false,
        span: t.span
      };
    });

    this.infix(TokenType.LBRACKET, 80, (p, left, t) => {
      const index = p.parseExpression();
      const isOptional = p.match(TokenType.QUESTION);
      p.consume(TokenType.RBRACKET, "Expected ']' after index");
      return {
        kind: 'Index',
        object: left,
        index,
        isOptional,
        span: t.span
      };
    });

    this.infix(TokenType.ASSIGN, 10, (p, left, t) => ({
      kind: 'Assignment',
      target: left,
      operator: '=',
      value: p.parseExpression(10),
      span: t.span
    }));

    this.infix(TokenType.PLUS_EQ, 10, (p, left, t) => ({
      kind: 'Assignment',
      target: left,
      operator: '+=',
      value: p.parseExpression(10),
      span: t.span
    }));

    this.infix(TokenType.MINUS_EQ, 10, (p, left, t) => ({
      kind: 'Assignment',
      target: left,
      operator: '-=',
      value: p.parseExpression(10),
      span: t.span
    }));

    this.infix(TokenType.STAR_EQ, 10, (p, left, t) => ({
      kind: 'Assignment',
      target: left,
      operator: '*=',
      value: p.parseExpression(10),
      span: t.span
    }));

    this.infix(TokenType.SLASH_EQ, 10, (p, left, t) => ({
      kind: 'Assignment',
      target: left,
      operator: '/=',
      value: p.parseExpression(10),
      span: t.span
    }));

    this.infix(TokenType.NULL_COALESCE, 25, (p, left, t) => ({
      kind: 'Binary',
      left,
      operator: '??',
      right: p.parseExpression(25),
      span: t.span
    }));

    this.infix(TokenType.RANGE, 55, (p, left, t) => ({
      kind: 'Range',
      start: left,
      end: p.parseExpression(55),
      inclusive: false,
      span: t.span
    }));

    this.infix(TokenType.RANGE_INCLUSIVE, 55, (p, left, t) => ({
      kind: 'Range',
      start: left,
      end: p.parseExpression(55),
      inclusive: true,
      span: t.span
    }));

    this.infix(TokenType.AS, 15, (p, left, t) => {
      const targetType = p.parseTypeExpression();
      return {
        kind: 'TypeCast',
        expression: left,
        targetType,
        isSafe: false,
        span: t.span
      };
    });

    this.infix(TokenType.IS, 40, (p, left, t) => {
      const checkType = p.parseTypeExpression();
      return {
        kind: 'TypeCheck',
        expression: left,
        checkType,
        span: t.span
      };
    });
  }

  private prefix(type: TokenType, parselet: PrefixParselet): void {
    this.prefixParselets.set(type, parselet);
  }

  private infix(type: TokenType, precedence: number, parse: (p: Parser, left: AST.Expression, token: Token) => AST.Expression): void {
    this.infixParselets.set(type, { precedence, parse });
  }

  parse(): AST.Program {
    const statements: AST.Statement[] = [];
    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    return {
      kind: 'Program',
      body: statements,
      sourceFile: ''
    };
  }

  parseExpression(precedence: number = 0): AST.Expression {
    const token = this.advance();
    const prefix = this.prefixParselets.get(token.type);

    if (!prefix) {
      throw new ParseError(`Unexpected token: ${token.value}`, token.span);
    }

    let left = prefix.parse(this, token);

    while (precedence < this.getPrecedence()) {
      const infixToken = this.advance();
      const infix = this.infixParselets.get(infixToken.type);
      if (infix) {
        left = infix.parse(this, left, infixToken);
      }
    }

    return left;
  }

  private parseStatement(): AST.Statement | null {
    if (this.match(TokenType.NEWLINE) || this.match(TokenType.COMMENT) || this.match(TokenType.DOC_COMMENT)) {
      return null;
    }

    switch (this.current().type) {
      case TokenType.LET:
      case TokenType.CONST:
      case TokenType.VAR:
        return this.parseVarDecl();
      case TokenType.MUT:
        return this.parseVarDecl();
      case TokenType.PUB:
        this.advance();
        return this.parsePubStatement();
      case TokenType.FN:
      case TokenType.ASYNC:
        return this.parseFnDecl();
      case TokenType.IF:
        return this.parseIf();
      case TokenType.WHILE:
        return this.parseWhile();
      case TokenType.FOR:
        return this.parseFor();
      case TokenType.LOOP:
        return this.parseLoop();
      case TokenType.MATCH:
        return this.parseMatchStmt();
      case TokenType.RETURN:
        return this.parseReturn();
      case TokenType.BREAK:
        return this.parseBreak();
      case TokenType.CONTINUE:
        return this.parseContinue();
      case TokenType.STRUCT:
        return this.parseStruct();
      case TokenType.ENUM:
        return this.parseEnum();
      case TokenType.TRAIT:
        return this.parseTrait();
      case TokenType.IMPL:
        return this.parseImpl();
      case TokenType.IMPORT:
        return this.parseImport();
      case TokenType.EXPORT:
        return this.parseExport();
      case TokenType.DEFER:
        return this.parseDefer();
      case TokenType.GUARD:
        return this.parseGuard();
      case TokenType.TYPE:
        return this.parseTypeAlias();
      case TokenType.THROW:
        return this.parseThrow();
      default:
        return this.parseExprStmt();
    }
  }

  private parseVarDecl(): AST.VarDecl {
    const isConst = this.match(TokenType.CONST);
    const isMut = this.match(TokenType.MUT) || (!isConst && this.match(TokenType.LET));
    if (!isConst && !isMut) this.advance(); // var

    const name = this.consume(TokenType.IDENTIFIER, "Expected variable name").value;

    let typeAnnotation: AST.TypeExpr | null = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeExpression();
    }

    let initializer: AST.Expression | null = null;
    if (this.match(TokenType.ASSIGN)) {
      initializer = this.parseExpression();
    }

    this.match(TokenType.SEMICOLON);

    return {
      kind: 'VarDecl',
      name,
      isConst,
      isMut: isMut || !isConst,
      typeAnnotation,
      initializer,
      span: this.current().span
    };
  }

  private parseFnDecl(): AST.FnDecl {
    const isAsync = this.match(TokenType.ASYNC);
    this.consume(TokenType.FN, "Expected 'fn'");
    const name = this.consume(TokenType.IDENTIFIER, "Expected function name").value;

    const generics = this.parseGenerics();

    this.consume(TokenType.LPAREN, "Expected '(' after function name");
    const params = this.parseParams();
    this.consume(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType: AST.TypeExpr | null = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeExpression();
    }

    const body = this.parseBlock();

    return {
      kind: 'FnDecl',
      name,
      isAsync,
      isPub: false,
      generics,
      params,
      returnType,
      body,
      span: this.current().span
    };
  }

  private parseParams(): AST.Param[] {
    const params: AST.Param[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        const isRef = this.match(TokenType.REF);
        const isMut = this.match(TokenType.MUT);
        const name = this.consume(TokenType.IDENTIFIER, "Expected parameter name").value;

        let type: AST.TypeExpr | null = null;
        if (this.match(TokenType.COLON)) {
          type = this.parseTypeExpression();
        }

        let defaultValue: AST.Expression | null = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.parseExpression();
        }

        params.push({
          name,
          type,
          defaultValue,
          isRef,
          isMut,
          span: this.current().span
        });
      } while (this.match(TokenType.COMMA));
    }
    return params;
  }

  private parseGenerics(): AST.GenericParam[] {
    if (!this.match(TokenType.LT)) return [];
    const generics: AST.GenericParam[] = [];
    do {
      const name = this.consume(TokenType.IDENTIFIER, "Expected generic parameter name").value;
      const bounds: AST.TypeExpr[] = [];
      if (this.match(TokenType.COLON)) {
        do {
          bounds.push(this.parseTypeExpression());
        } while (this.match(TokenType.PLUS));
      }
      let defaultType: AST.TypeExpr | null = null;
      if (this.match(TokenType.ASSIGN)) {
        defaultType = this.parseTypeExpression();
      }
      generics.push({ name, bounds, defaultType, span: this.current().span });
    } while (this.match(TokenType.COMMA));
    this.consume(TokenType.GT, "Expected '>' after generic parameters");
    return generics;
  }

  private parseBlock(): AST.Block {
    this.consume(TokenType.LBRACE, "Expected '{' to start block");
    const statements: AST.Statement[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    this.consume(TokenType.RBRACE, "Expected '}' to end block");
    return {
      kind: 'Block',
      statements,
      span: this.current().span
    };
  }

  private parseIf(): AST.IfStmt {
    const span = this.advance().span;
    const condition = this.parseExpression();
    const thenBranch = this.parseBlock();
    let elseBranch: AST.Block | AST.IfStmt | null = null;
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        elseBranch = this.parseIf();
      } else {
        elseBranch = this.parseBlock();
      }
    }
    return {
      kind: 'If',
      condition,
      thenBranch,
      elseBranch,
      span
    };
  }

  private parseWhile(): AST.WhileStmt {
    const span = this.advance().span;
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { kind: 'While', condition, body, span };
  }

  private parseFor(): AST.ForStmt | AST.ForInStmt {
    const span = this.advance().span;

    if (this.check(TokenType.LPAREN) || this.peek(1).type === TokenType.SEMICOLON) {
      // C-style for
      this.consume(TokenType.LPAREN, "Expected '('");
      const init = this.check(TokenType.SEMICOLON) ? null :
        this.check(TokenType.LET) || this.check(TokenType.CONST) ? this.parseVarDecl() :
        this.parseExprStmt();
      this.consume(TokenType.SEMICOLON, "Expected ';'");
      const condition = this.check(TokenType.SEMICOLON) ? null : this.parseExpression();
      this.consume(TokenType.SEMICOLON, "Expected ';'");
      const increment = this.check(TokenType.RPAREN) ? null : this.parseExpression();
      this.consume(TokenType.RPAREN, "Expected ')'");
      const body = this.parseBlock();
      return { kind: 'For', init, condition, increment, body, span };
    }

    // For-in
    const isConst = this.match(TokenType.CONST);
    const varName = this.consume(TokenType.IDENTIFIER, "Expected loop variable").value;
    this.consume(TokenType.IN, "Expected 'in' in for-in loop");
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    return { kind: 'ForIn', varName, isConst, iterable, body, span };
  }

  private parseLoop(): AST.WhileStmt {
    const span = this.advance().span;
    const body = this.parseBlock();
    return { kind: 'While', condition: { kind: 'Literal', value: true, raw: 'true', span }, body, span };
  }

  private parseMatchStmt(): AST.MatchStmt {
    const span = this.advance().span;
    const expression = this.parseExpression();
    this.consume(TokenType.LBRACE, "Expected '{' after match expression");
    const arms: AST.MatchArm[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const pattern = this.parsePattern();
      let guard: AST.Expression | null = null;
      if (this.match(TokenType.IF)) {
        guard = this.parseExpression();
      }
      this.consume(TokenType.FAT_ARROW, "Expected '=>' after pattern");
      const body = this.check(TokenType.LBRACE) ? this.parseBlock() : this.parseExpression();
      arms.push({ pattern, guard, body, span: this.current().span });
      this.match(TokenType.COMMA);
    }
    this.consume(TokenType.RBRACE, "Expected '}' after match arms");
    return { kind: 'Match', expression, arms, span };
  }

  private parseMatchExpression(span: Span): AST.MatchStmt {
    const expression = this.parseExpression();
    this.consume(TokenType.LBRACE, "Expected '{' after match expression");
    const arms: AST.MatchArm[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const pattern = this.parsePattern();
      this.consume(TokenType.FAT_ARROW, "Expected '=>' after pattern");
      const body = this.parseExpression();
      arms.push({ pattern, guard: null, body, span: this.current().span });
      this.match(TokenType.COMMA);
    }
    this.consume(TokenType.RBRACE, "Expected '}' after match arms");
    return { kind: 'Match', expression, arms, span };
  }

  private parsePattern(): AST.Pattern {
    if (this.match(TokenType.UNDERSCORE)) {
      return { kind: 'WildcardPattern', span: this.current().span };
    }

    if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
        this.check(TokenType.TRUE) || this.check(TokenType.FALSE) || this.check(TokenType.NIL)) {
      const lit = this.parseExpression();
      return { kind: 'LiteralPattern', value: lit as AST.Literal, span: lit.span };
    }

    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      if (this.check(TokenType.LBRACE)) {
        // Struct pattern: Point { x, y }
        this.advance();
        const fields: [string, AST.Pattern][] = [];
        if (!this.check(TokenType.RBRACE)) {
          do {
            const fname = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
            this.consume(TokenType.COLON, "Expected ':' after field name");
            const fpat = this.parsePattern();
            fields.push([fname, fpat]);
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RBRACE, "Expected '}' after struct pattern fields");
        return { kind: 'StructPattern', name, fields, span: this.current().span };
      }
      if (this.check(TokenType.LPAREN)) {
        // Enum or tuple pattern
        this.advance();
        const fields: AST.Pattern[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            fields.push(this.parsePattern());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expected ')'");
        return { kind: 'EnumPattern', enumName: '', variant: name, fields, span: this.current().span };
      }
      return { kind: 'VariablePattern', name, span: this.current().span };
    }

    if (this.match(TokenType.LBRACKET)) {
      const elements: AST.Pattern[] = [];
      let rest: AST.Pattern | null = null;
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        if (this.match(TokenType.ELLIPSIS)) {
          rest = this.parsePattern();
          break;
        }
        elements.push(this.parsePattern());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.consume(TokenType.RBRACKET, "Expected ']'");
      return { kind: 'ArrayPattern', elements, rest, span: this.current().span };
    }

    throw new ParseError("Expected pattern", this.current().span);
  }

  private parseReturn(): AST.ReturnStmt {
    const span = this.advance().span;
    const value = this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON) ||
      this.check(TokenType.RBRACE) || this.isAtEnd()
      ? null
      : this.parseExpression();
    this.match(TokenType.SEMICOLON);
    return { kind: 'Return', value, span };
  }

  private parseBreak(): AST.BreakStmt {
    const span = this.advance().span;
    const label = this.check(TokenType.IDENTIFIER) ? this.advance().value : null;
    this.match(TokenType.SEMICOLON);
    return { kind: 'Break', label, span };
  }

  private parseContinue(): AST.ContinueStmt {
    const span = this.advance().span;
    const label = this.check(TokenType.IDENTIFIER) ? this.advance().value : null;
    this.match(TokenType.SEMICOLON);
    return { kind: 'Continue', label, span };
  }

  private parseThrow(): AST.ExprStmt {
    const span = this.advance().span;
    const expr = this.parseExpression();
    this.match(TokenType.SEMICOLON);
    return {
      kind: 'ExprStmt',
      expression: {
        kind: 'Call',
        callee: { kind: 'Identifier', name: '__throw', span },
        args: [{ name: null, value: expr, isSpread: false, span: expr.span }],
        isAsync: false,
        isTail: false,
        span
      },
      span
    };
  }

  private parseStruct(): AST.StructDecl {
    const span = this.advance().span;
    const name = this.consume(TokenType.IDENTIFIER, "Expected struct name").value;
    const generics = this.parseGenerics();
    this.consume(TokenType.LBRACE, "Expected '{' after struct name");

    const fields: AST.StructField[] = [];
    const methods: AST.FnDecl[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FN)) {
        methods.push(this.parseFnDecl());
      } else {
        const isPub = this.match(TokenType.PUB);
        const fname = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
        this.consume(TokenType.COLON, "Expected ':' after field name");
        const ftype = this.parseTypeExpression();
        let defaultValue: AST.Expression | null = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.parseExpression();
        }
        fields.push({ name: fname, type: ftype, defaultValue, isPub, span: this.current().span });
        this.match(TokenType.COMMA);
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after struct fields");
    return { kind: 'StructDecl', name, isPub: false, generics, fields, methods, span };
  }

  private parseEnum(): AST.EnumDecl {
    const span = this.advance().span;
    const name = this.consume(TokenType.IDENTIFIER, "Expected enum name").value;
    const generics = this.parseGenerics();
    this.consume(TokenType.LBRACE, "Expected '{' after enum name");

    const variants: AST.EnumVariant[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const vname = this.consume(TokenType.IDENTIFIER, "Expected variant name").value;
      let fields: AST.EnumField[] = [];
      let discriminant: number | null = null;

      if (this.match(TokenType.LPAREN)) {
        do {
          let fname: string | null = null;
          if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
            fname = this.advance().value;
            this.advance(); // :
          }
          const ftype = this.parseTypeExpression();
          fields.push({ name: fname, type: ftype, span: this.current().span });
        } while (this.match(TokenType.COMMA));
        this.consume(TokenType.RPAREN, "Expected ')'");
      }

      if (this.match(TokenType.ASSIGN)) {
        discriminant = parseInt(this.consume(TokenType.NUMBER, "Expected discriminant").value);
      }

      variants.push({ name: vname, fields, discriminant, span: this.current().span });
      this.match(TokenType.COMMA);
    }

    this.consume(TokenType.RBRACE, "Expected '}' after enum variants");
    return { kind: 'EnumDecl', name, isPub: false, generics, variants, span };
  }

  private parseTrait(): AST.TraitDecl {
    const span = this.advance().span;
    const name = this.consume(TokenType.IDENTIFIER, "Expected trait name").value;
    const generics = this.parseGenerics();
    this.consume(TokenType.LBRACE, "Expected '{' after trait name");

    const methods: AST.FnSignature[] = [];
    const associatedTypes: string[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.TYPE)) {
        associatedTypes.push(this.consume(TokenType.IDENTIFIER, "Expected associated type name").value);
        this.match(TokenType.SEMICOLON);
      } else if (this.check(TokenType.FN)) {
        this.advance();
        const mname = this.consume(TokenType.IDENTIFIER, "Expected method name").value;
        const mgenerics = this.parseGenerics();
        this.consume(TokenType.LPAREN, "Expected '('");
        const params = this.parseParams();
        this.consume(TokenType.RPAREN, "Expected ')'");
        let returnType: AST.TypeExpr | null = null;
        if (this.match(TokenType.THIN_ARROW)) {
          returnType = this.parseTypeExpression();
        }
        this.match(TokenType.SEMICOLON);
        methods.push({ name: mname, generics: mgenerics, params, returnType, span: this.current().span });
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after trait body");
    return { kind: 'TraitDecl', name, isPub: false, generics, methods, associatedTypes, span };
  }

  private parseImpl(): AST.ImplDecl {
    const span = this.advance().span;
    const generics = this.parseGenerics();
    let target = this.parseTypeExpression();
    let trait: AST.TypeExpr | null = null;

    if (this.match(TokenType.FOR)) {
      trait = target;
      target = this.parseTypeExpression();
    }

    this.consume(TokenType.LBRACE, "Expected '{' after impl target");
    const methods: AST.FnDecl[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      methods.push(this.parseFnDecl());
    }
    this.consume(TokenType.RBRACE, "Expected '}' after impl body");
    return { kind: 'ImplDecl', target, trait, generics, methods, span };
  }

  private parseImport(): AST.ImportDecl {
    const span = this.advance().span;
    let path: string;
    let items: AST.ImportItem[] | null = null;
    let alias: string | null = null;

    if (this.check(TokenType.STRING)) {
      path = this.advance().value.slice(1, -1);
    } else {
      path = this.consume(TokenType.IDENTIFIER, "Expected import path").value;
      while (this.match(TokenType.DOT)) {
        path += '.' + this.consume(TokenType.IDENTIFIER, "Expected module name").value;
      }
    }

    if (this.match(TokenType.AS)) {
      alias = this.consume(TokenType.IDENTIFIER, "Expected alias").value;
    }

    if (this.match(TokenType.LBRACE)) {
      items = [];
      do {
        const isType = this.match(TokenType.TYPE);
        const name = this.consume(TokenType.IDENTIFIER, "Expected import item").value;
        let itemAlias: string | null = null;
        if (this.match(TokenType.AS)) {
          itemAlias = this.consume(TokenType.IDENTIFIER, "Expected alias").value;
        }
        items.push({ name, alias: itemAlias, isType, span: this.current().span });
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RBRACE, "Expected '}' after import items");
    }

    this.match(TokenType.SEMICOLON);
    return { kind: 'Import', path, items, alias, span };
  }

  private parseExport(): AST.ExportDecl {
    const span = this.advance().span;
    const declaration = this.parseStatement()!;
    return { kind: 'Export', declaration, span };
  }

  private parsePubStatement(): AST.Statement {
    const stmt = this.parseStatement()!;
    if (stmt.kind === 'FnDecl') return { ...stmt, isPub: true };
    if (stmt.kind === 'StructDecl') return { ...stmt, isPub: true };
    if (stmt.kind === 'EnumDecl') return { ...stmt, isPub: true };
    if (stmt.kind === 'TraitDecl') return { ...stmt, isPub: true };
    return stmt;
  }

  private parseDefer(): AST.DeferStmt {
    const span = this.advance().span;
    const expression = this.parseExpression();
    this.match(TokenType.SEMICOLON);
    return { kind: 'Defer', expression, span };
  }

  private parseGuard(): AST.GuardStmt {
    const span = this.advance().span;
    const condition = this.parseExpression();
    const elseBranch = this.parseBlock();
    return { kind: 'Guard', condition, elseBranch, span };
  }

  private parseTypeAlias(): AST.Statement {
    this.advance(); // type
    const name = this.consume(TokenType.IDENTIFIER, "Expected type name").value;
    const generics = this.parseGenerics();
    this.consume(TokenType.ASSIGN, "Expected '=' in type alias");
    const type = this.parseTypeExpression();
    this.match(TokenType.SEMICOLON);
    // FIX: Return a proper type alias node as ExprStmt for now
    // In a full implementation, add TypeAliasDecl to AST
    return {
      kind: 'ExprStmt',
      expression: {
        kind: 'Identifier',
        name: `${name}=${JSON.stringify(type)}`,
        span: this.current().span
      },
      span: this.current().span
    };
  }

  private parseExprStmt(): AST.ExprStmt {
    const expr = this.parseExpression();
    this.match(TokenType.SEMICOLON);
    return { kind: 'ExprStmt', expression: expr, span: expr.span };
  }

  private parseTableOrBlock(): AST.Expression {
    // Lookahead: if next token is an identifier followed by ':' or '}' (empty table),
    // it's a table literal. Otherwise, it's a block expression.
    const savePos = this.pos;

    // Try to determine if it's a table or block
    let isTable = false;
    let depth = 1;
    let i = savePos;

    while (i < this.tokens.length && depth > 0) {
      const t = this.tokens[i];
      if (t.type === TokenType.LBRACE) depth++;
      else if (t.type === TokenType.RBRACE) depth--;
      else if (depth === 1 && t.type === TokenType.IDENTIFIER) {
        // Check if next non-newline is ':'
        let j = i + 1;
        while (j < this.tokens.length && this.tokens[j].type === TokenType.NEWLINE) j++;
        if (j < this.tokens.length && this.tokens[j].type === TokenType.COLON) {
          isTable = true;
          break;
        }
      }
      i++;
    }

    // Reset and parse accordingly
    if (isTable) {
      return this.parseTableLiteral();
    } else {
      // It's a block expression
      this.pos = savePos - 1; // Back up because we already consumed '{'
      const block = this.parseBlock();
      return {
        kind: 'BlockExpr',
        block,
        span: block.span
      };
    }
  }

  private parseTableLiteral(): AST.TableExpr {
    const span = this.current().span;
    this.consume(TokenType.LBRACE, "Expected '{'");
    const entries: AST.TableEntry[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      let key: AST.Expression | string;
      let isComputed = false;

      if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
        key = this.advance().value;
        this.advance(); // :
      } else if (this.match(TokenType.LBRACKET)) {
        key = this.parseExpression();
        isComputed = true;
        this.consume(TokenType.RBRACKET, "Expected ']' after computed key");
        this.consume(TokenType.COLON, "Expected ':' after key");
      } else {
        // Shorthand: { a, b } => { a: a, b: b }
        const name = this.consume(TokenType.IDENTIFIER, "Expected table key").value;
        entries.push({ key: name, value: { kind: 'Identifier', name, span: this.current().span }, isComputed: false, span: this.current().span });
        if (!this.match(TokenType.COMMA)) break;
        continue;
      }

      const value = this.parseExpression();
      entries.push({ key, value, isComputed, span: this.current().span });
      if (!this.match(TokenType.COMMA)) break;
    }

    this.consume(TokenType.RBRACE, "Expected '}' after table entries");
    return { kind: 'Table', entries, span };
  }

  private parseLambda(span: Span): AST.LambdaExpr {
    this.consume(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParams();
    this.consume(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType: AST.TypeExpr | null = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeExpression();
    }

    let body: AST.Block | AST.Expression;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      this.consume(TokenType.FAT_ARROW, "Expected '=>' for lambda body");
      body = this.parseExpression();
    }

    return {
      kind: 'Lambda',
      params,
      returnType,
      body,
      isAsync: false,
      span
    };
  }

  private parseTernary(span: Span): AST.TernaryExpr {
    const condition = this.parseExpression();
    this.consume(TokenType.ELSE, "Expected 'else' in ternary");
    const thenExpr = this.parseExpression();
    this.consume(TokenType.ELSE, "Expected second 'else' in ternary");
    const elseExpr = this.parseExpression();
    return { kind: 'Ternary', condition, thenExpr, elseExpr, span };
  }

  private parseTryExpression(span: Span): AST.TryExpr {
    const expression = this.parseExpression();
    let catchVar: string | null = null;
    let catchBody: AST.Block | null = null;
    let finallyBody: AST.Block | null = null;

    if (this.match(TokenType.CATCH)) {
      if (this.match(TokenType.LPAREN)) {
        catchVar = this.consume(TokenType.IDENTIFIER, "Expected catch variable").value;
        this.consume(TokenType.RPAREN, "Expected ')'");
      }
      catchBody = this.parseBlock();
    }

    if (this.match(TokenType.FINALLY)) {
      finallyBody = this.parseBlock();
    }

    return { kind: 'Try', expression, catchVar, catchBody, finallyBody, span };
  }

  private parseTypeExpression(): AST.TypeExpr {
    return this.parseUnionType();
  }

  private parseUnionType(): AST.TypeExpr {
    let left = this.parseIntersectionType();
    while (this.match(TokenType.PIPE)) {
      const right = this.parseIntersectionType();
      left = { kind: 'UnionType', types: [left, right], span: this.current().span };
    }
    return left;
  }

  private parseIntersectionType(): AST.TypeExpr {
    let left = this.parsePostfixType();
    while (this.match(TokenType.AMPERSAND)) {
      const right = this.parsePostfixType();
      left = { kind: 'IntersectionType', types: [left, right], span: this.current().span };
    }
    return left;
  }

  private parsePostfixType(): AST.TypeExpr {
    let type = this.parsePrimaryType();

    while (true) {
      if (this.match(TokenType.QUESTION)) {
        type = { kind: 'OptionalType', inner: type, span: this.current().span };
      } else if (this.match(TokenType.LBRACKET)) {
        this.consume(TokenType.RBRACKET, "Expected ']'");
        type = { kind: 'ArrayType', element: type, span: this.current().span };
      } else if (this.match(TokenType.LT)) {
        const args: AST.TypeExpr[] = [];
        do {
          args.push(this.parseTypeExpression());
        } while (this.match(TokenType.COMMA));
        this.consume(TokenType.GT, "Expected '>'");
        type = { kind: 'GenericType', name: (type as AST.NamedType).name, args, span: this.current().span };
      } else {
        break;
      }
    }

    return type;
  }

  private parsePrimaryType(): AST.TypeExpr {
    if (this.match(TokenType.REF)) {
      return { kind: 'RefType', inner: this.parsePrimaryType(), span: this.current().span };
    }

    if (this.match(TokenType.MUT)) {
      return { kind: 'MutType', inner: this.parsePrimaryType(), span: this.current().span };
    }

    if (this.match(TokenType.SELF)) {
      return { kind: 'SelfType', span: this.current().span };
    }

    if (this.match(TokenType.LPAREN)) {
      const types: AST.TypeExpr[] = [];
      if (!this.check(TokenType.RPAREN)) {
        do {
          types.push(this.parseTypeExpression());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RPAREN, "Expected ')'");

      if (this.match(TokenType.THIN_ARROW)) {
        const returnType = this.parseTypeExpression();
        return { kind: 'FunctionType', params: types, returnType, span: this.current().span };
      }

      return { kind: 'TupleType', elements: types, span: this.current().span };
    }

    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      return { kind: 'NamedType', name, span: this.current().span };
    }

    throw new ParseError("Expected type expression", this.current().span);
  }

  private getPrecedence(): number {
    const infix = this.infixParselets.get(this.current().type);
    return infix ? infix.precedence : 0;
  }

  // Utility methods
  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private peek(offset: number = 0): Token {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private isAtEnd(): boolean {
    return this.current().type === TokenType.EOF;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParseError(`${message}, got ${this.current().value}`, this.current().span);
  }
}

export function parse(source: string, fileName?: string): AST.Program {
  const { tokenize } = require('./tokenizer');
  const tokens = tokenize(source, fileName);
  return new Parser(tokens).parse();
        }
