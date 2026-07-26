// Luazi Compiler - C# Frontend
// Parses .lz files and compiles to bytecode

using System.Text;
using System.Text.RegularExpressions;

namespace Luazi.Compiler;

/// <summary>
/// Luazi source tokenizer - single-pass with lookahead
/// </summary>
public ref struct LzTokenizer
{
    private readonly ReadOnlySpan<char> _source;
    private int _pos;
    private int _line;
    private int _col;

    public LzTokenizer(ReadOnlySpan<char> source)
    {
        _source = source;
        _pos = 0;
        _line = 1;
        _col = 1;
    }

    public Token NextToken()
    {
        SkipWhitespace();
        if (_pos >= _source.Length)
            return new Token(TokenType.EOF, "", _line, _col);

        char c = _source[_pos];

        // Numbers
        if (char.IsDigit(c) || (c == '.' && _pos + 1 < _source.Length && char.IsDigit(_source[_pos + 1])))
            return ReadNumber();

        // Identifiers and keywords
        if (char.IsLetter(c) || c == '_')
            return ReadIdentifier();

        // Strings
        if (c == '"' || c == '\'')
            return ReadString();

        // Operators and punctuation
        return ReadOperator();
    }

    private void SkipWhitespace()
    {
        while (_pos < _source.Length)
        {
            char c = _source[_pos];
            if (c == ' ' || c == '\t') { _pos++; _col++; }
            else if (c == '\n') { _pos++; _line++; _col = 1; }
            else if (c == '-' && _pos + 1 < _source.Length && _source[_pos + 1] == '-')
            {
                // Comment
                _pos += 2;
                while (_pos < _source.Length && _source[_pos] != '\n') _pos++;
            }
            else if (c == '/' && _pos + 1 < _source.Length && _source[_pos + 1] == '*')
            {
                // Block comment
                _pos += 2;
                while (_pos + 1 < _source.Length && !(_source[_pos] == '*' && _source[_pos + 1] == '/'))
                {
                    if (_source[_pos] == '\n') { _line++; _col = 1; }
                    _pos++;
                }
                _pos += 2;
            }
            else break;
        }
    }

    private Token ReadNumber()
    {
        int start = _pos;
        int startCol = _col;
        bool hasDot = false;

        while (_pos < _source.Length)
        {
            char c = _source[_pos];
            if (char.IsDigit(c)) { _pos++; _col++; }
            else if (c == '.' && !hasDot) { hasDot = true; _pos++; _col++; }
            else if ((c == 'e' || c == 'E') && _pos + 1 < _source.Length)
            {
                _pos++; _col++;
                if (_source[_pos] == '+' || _source[_pos] == '-') { _pos++; _col++; }
                while (_pos < _source.Length && char.IsDigit(_source[_pos])) { _pos++; _col++; }
                break;
            }
            else break;
        }

        return new Token(TokenType.Number, _source[start.._pos].ToString(), _line, startCol);
    }

    private Token ReadIdentifier()
    {
        int start = _pos;
        int startCol = _col;

        while (_pos < _source.Length && (char.IsLetterOrDigit(_source[_pos]) || _source[_pos] == '_'))
        {
            _pos++; _col++;
        }

        var text = _source[start.._pos].ToString();
        var type = text switch
        {
            "let" or "const" or "var" => TokenType.KeywordVar,
            "fn" or "function" => TokenType.KeywordFn,
            "if" => TokenType.KeywordIf,
            "else" => TokenType.KeywordElse,
            "while" => TokenType.KeywordWhile,
            "for" => TokenType.KeywordFor,
            "in" => TokenType.KeywordIn,
            "return" => TokenType.KeywordReturn,
            "break" => TokenType.KeywordBreak,
            "continue" => TokenType.KeywordContinue,
            "match" => TokenType.KeywordMatch,
            "type" => TokenType.KeywordType,
            "struct" => TokenType.KeywordStruct,
            "enum" => TokenType.KeywordEnum,
            "impl" => TokenType.KeywordImpl,
            "trait" => TokenType.KeywordTrait,
            "async" => TokenType.KeywordAsync,
            "await" => TokenType.KeywordAwait,
            "yield" => TokenType.KeywordYield,
            "try" => TokenType.KeywordTry,
            "catch" => TokenType.KeywordCatch,
            "throw" => TokenType.KeywordThrow,
            "import" => TokenType.KeywordImport,
            "export" => TokenType.KeywordExport,
            "from" => TokenType.KeywordFrom,
            "as" => TokenType.KeywordAs,
            "is" => TokenType.KeywordIs,
            "and" => TokenType.KeywordAnd,
            "or" => TokenType.KeywordOr,
            "not" => TokenType.KeywordNot,
            "nil" => TokenType.KeywordNil,
            "true" => TokenType.KeywordTrue,
            "false" => TokenType.KeywordFalse,
            "self" => TokenType.KeywordSelf,
            "super" => TokenType.KeywordSuper,
            "pub" => TokenType.KeywordPub,
            "mut" => TokenType.KeywordMut,
            "ref" => TokenType.KeywordRef,
            "unsafe" => TokenType.KeywordUnsafe,
            "where" => TokenType.KeywordWhere,
            "loop" => TokenType.KeywordLoop,
            "defer" => TokenType.KeywordDefer,
            "guard" => TokenType.KeywordGuard,
            _ => TokenType.Identifier
        };

        return new Token(type, text, _line, startCol);
    }

    private Token ReadString()
    {
        char quote = _source[_pos];
        int start = _pos;
        int startCol = _col;
        _pos++; _col++;

        var sb = new StringBuilder();
        while (_pos < _source.Length && _source[_pos] != quote)
        {
            if (_source[_pos] == '\\')
            {
                _pos++;
                char esc = _pos < _source.Length ? _source[_pos] : '\0';
                sb.Append(esc switch
                {
                    'n' => '\n',
                    't' => '\t',
                    'r' => '\r',
                    '\\' => '\\',
                    '"' => '"',
                    '\'' => '\'',
                    '0' => '\0',
                    _ => esc
                });
            }
            else
            {
                sb.Append(_source[_pos]);
            }
            _pos++; _col++;
        }

        if (_pos < _source.Length) { _pos++; _col++; }

        return new Token(TokenType.String, sb.ToString(), _line, startCol);
    }

    private Token ReadOperator()
    {
        int startCol = _col;
        char c = _source[_pos];
        _pos++; _col++;

        // Multi-char operators
        if (_pos < _source.Length)
        {
            char next = _source[_pos];
            var twoChar = c.ToString() + next;

            TokenType? type = twoChar switch
            {
                "==" => TokenType.OpEq,
                "!=" => TokenType.OpNeq,
                "<=" => TokenType.OpLe,
                ">=" => TokenType.OpGe,
                "<<" => TokenType.OpShl,
                ">>" => TokenType.OpShr,
                ".." => TokenType.OpConcat,
                "+=" => TokenType.OpAddAssign,
                "-=" => TokenType.OpSubAssign,
                "*=" => TokenType.OpMulAssign,
                "/=" => TokenType.OpDivAssign,
                "=>" => TokenType.FatArrow,
                "->" => TokenType.ThinArrow,
                "::" => TokenType.DoubleColon,
                "??" => TokenType.OpNullCoalesce,
                "?." => TokenType.OpOptionalChain,
                _ => null
            };

            if (type.HasValue)
            {
                _pos++; _col++;
                return new Token(type.Value, twoChar, _line, startCol);
            }
        }

        // Single char
        return new Token(c switch
        {
            '+' => TokenType.OpPlus,
            '-' => TokenType.OpMinus,
            '*' => TokenType.OpStar,
            '/' => TokenType.OpSlash,
            '%' => TokenType.OpPercent,
            '^' => TokenType.OpCaret,
            '#' => TokenType.OpHash,
            '&' => TokenType.OpAmpersand,
            '|' => TokenType.OpPipe,
            '~' => TokenType.OpTilde,
            '<' => TokenType.OpLt,
            '>' => TokenType.OpGt,
            '=' => TokenType.OpAssign,
            '(' => TokenType.LParen,
            ')' => TokenType.RParen,
            '{' => TokenType.LBrace,
            '}' => TokenType.RBrace,
            '[' => TokenType.LBracket,
            ']' => TokenType.RBracket,
            ';' => TokenType.Semicolon,
            ':' => TokenType.Colon,
            ',' => TokenType.Comma,
            '.' => TokenType.Dot,
            '?' => TokenType.Question,
            '!' => TokenType.Bang,
            '@' => TokenType.At,
            '$' => TokenType.Dollar,
            _ => TokenType.Unknown
        }, c.ToString(), _line, startCol);
    }
}

public readonly record struct Token(TokenType Type, string Value, int Line, int Col);

public enum TokenType
{
    // Literals
    Number, String, Identifier,

    // Keywords
    KeywordVar, KeywordFn, KeywordIf, KeywordElse,
    KeywordWhile, KeywordFor, KeywordIn, KeywordReturn,
    KeywordBreak, KeywordContinue, KeywordMatch,
    KeywordType, KeywordStruct, KeywordEnum, KeywordImpl,
    KeywordTrait, KeywordAsync, KeywordAwait, KeywordYield,
    KeywordTry, KeywordCatch, KeywordThrow,
    KeywordImport, KeywordExport, KeywordFrom, KeywordAs,
    KeywordIs, KeywordAnd, KeywordOr, KeywordNot,
    KeywordNil, KeywordTrue, KeywordFalse,
    KeywordSelf, KeywordSuper,
    KeywordPub, KeywordMut, KeywordRef, KeywordUnsafe,
    KeywordWhere, KeywordLoop, KeywordDefer, KeywordGuard,

    // Operators
    OpPlus, OpMinus, OpStar, OpSlash, OpPercent,
    OpCaret, OpHash, OpAmpersand, OpPipe, OpTilde,
    OpLt, OpGt, OpLe, OpGe, OpEq, OpNeq,
    OpShl, OpShr, OpConcat,
    OpAssign, OpAddAssign, OpSubAssign, OpMulAssign, OpDivAssign,
    OpNullCoalesce, OpOptionalChain,

    // Delimiters
    LParen, RParen, LBrace, RBrace, LBracket, RBracket,
    Semicolon, Colon, Comma, Dot, Question, Bang,
    At, Dollar,

    // Special
    FatArrow, ThinArrow, DoubleColon,
    Unknown, EOF
}

/// <summary>
/// Recursive descent parser with Pratt parsing for expressions
/// </summary>
public class LzParser
{
    private readonly List<Token> _tokens;
    private int _pos;

    public LzParser(List<Token> tokens)
    {
        _tokens = tokens;
        _pos = 0;
    }

    public AstNode Parse()
    {
        var statements = new List<AstNode>();
        while (!IsAtEnd())
        {
            statements.Add(ParseStatement());
        }
        return new AstNode.Block(statements);
    }

    private AstNode ParseStatement()
    {
        return Current.Type switch
        {
            TokenType.KeywordVar or TokenType.KeywordLet or TokenType.KeywordConst => ParseVarDecl(),
            TokenType.KeywordFn => ParseFnDecl(),
            TokenType.KeywordIf => ParseIf(),
            TokenType.KeywordWhile => ParseWhile(),
            TokenType.KeywordFor => ParseFor(),
            TokenType.KeywordReturn => ParseReturn(),
            TokenType.KeywordMatch => ParseMatch(),
            TokenType.KeywordStruct => ParseStruct(),
            TokenType.KeywordEnum => ParseEnum(),
            TokenType.KeywordTrait => ParseTrait(),
            TokenType.KeywordImpl => ParseImpl(),
            TokenType.KeywordImport => ParseImport(),
            TokenType.KeywordExport => ParseExport(),
            TokenType.KeywordAsync => ParseAsync(),
            TokenType.KeywordDefer => ParseDefer(),
            TokenType.KeywordGuard => ParseGuard(),
            _ => ParseExprStatement()
        };
    }

    private AstNode ParseVarDecl()
    {
        bool isConst = Match(TokenType.KeywordConst);
        if (!isConst) Advance(); // let or var

        string name = Consume(TokenType.Identifier, "Expected variable name").Value;

        string? typeAnnotation = null;
        if (Match(TokenType.Colon))
        {
            typeAnnotation = ParseTypeExpression();
        }

        AstNode? init = null;
        if (Match(TokenType.OpAssign))
        {
            init = ParseExpression();
        }

        Match(TokenType.Semicolon); // Optional semicolon
        return new AstNode.VarDecl(name, isConst, typeAnnotation, init);
    }

    private AstNode ParseFnDecl()
    {
        Advance(); // fn
        string name = Consume(TokenType.Identifier, "Expected function name").Value;

        Consume(TokenType.LParen, "Expected '(' after function name");
        var parameters = new List<(string Name, string? Type)>();

        while (!Check(TokenType.RParen) && !IsAtEnd())
        {
            string pname = Consume(TokenType.Identifier, "Expected parameter name").Value;
            string? ptype = null;
            if (Match(TokenType.Colon))
            {
                ptype = ParseTypeExpression();
            }
            parameters.Add((pname, ptype));
            if (!Match(TokenType.Comma)) break;
        }

        Consume(TokenType.RParen, "Expected ')' after parameters");

        string? returnType = null;
        if (Match(TokenType.ThinArrow))
        {
            returnType = ParseTypeExpression();
        }

        var body = ParseBlock();
        return new AstNode.FnDecl(name, parameters, returnType, body);
    }

    private AstNode ParseIf()
    {
        Advance(); // if
        var condition = ParseExpression();
        var thenBranch = ParseBlock();
        AstNode? elseBranch = null;

        if (Match(TokenType.KeywordElse))
        {
            if (Check(TokenType.KeywordIf))
                elseBranch = ParseIf();
            else
                elseBranch = ParseBlock();
        }

        return new AstNode.If(condition, thenBranch, elseBranch);
    }

    private AstNode ParseWhile()
    {
        Advance(); // while
        var condition = ParseExpression();
        var body = ParseBlock();
        return new AstNode.While(condition, body);
    }

    private AstNode.ParseFor()
    {
        Advance(); // for
        string varName = Consume(TokenType.Identifier, "Expected loop variable").Value;
        Consume(TokenType.KeywordIn, "Expected 'in' in for loop");
        var iterable = ParseExpression();
        var body = ParseBlock();
        return new AstNode.For(varName, iterable, body);
    }

    private AstNode ParseMatch()
    {
        Advance(); // match
        var expr = ParseExpression();
        Consume(TokenType.LBrace, "Expected '{' after match expression");

        var arms = new List<(AstNode Pattern, AstNode Body)>();
        while (!Check(TokenType.RBrace) && !IsAtEnd())
        {
            var pattern = ParsePattern();
            Consume(TokenType.FatArrow, "Expected '=>' after pattern");
            var body = ParseExpression();
            arms.Add((pattern, body));
            Match(TokenType.Comma);
        }

        Consume(TokenType.RBrace, "Expected '}' after match arms");
        return new AstNode.Match(expr, arms);
    }

    private AstNode ParseStruct()
    {
        Advance(); // struct
        string name = Consume(TokenType.Identifier, "Expected struct name").Value;
        Consume(TokenType.LBrace, "Expected '{' after struct name");

        var fields = new List<(string Name, string Type, AstNode? Default)>();
        while (!Check(TokenType.RBrace) && !IsAtEnd())
        {
            string fname = Consume(TokenType.Identifier, "Expected field name").Value;
            Consume(TokenType.Colon, "Expected ':' after field name");
            string ftype = ParseTypeExpression();

            AstNode? def = null;
            if (Match(TokenType.OpAssign))
                def = ParseExpression();

            fields.Add((fname, ftype, def));
            if (!Match(TokenType.Comma)) break;
        }

        Consume(TokenType.RBrace, "Expected '}' after struct fields");
        return new AstNode.StructDecl(name, fields);
    }

    private AstNode ParseBlock()
    {
        Consume(TokenType.LBrace, "Expected '{' to start block");
        var statements = new List<AstNode>();

        while (!Check(TokenType.RBrace) && !IsAtEnd())
        {
            statements.Add(ParseStatement());
        }

        Consume(TokenType.RBrace, "Expected '}' to end block");
        return new AstNode.Block(statements);
    }

    private AstNode ParseExpression() => ParseAssignment();

    private AstNode ParseAssignment()
    {
        var left = ParseOr();

        if (Match(TokenType.OpAssign) || Match(TokenType.OpAddAssign) ||
            Match(TokenType.OpSubAssign) || Match(TokenType.OpMulAssign) ||
            Match(TokenType.OpDivAssign))
        {
            var op = Previous;
            var right = ParseAssignment();
            return new AstNode.Assign(left, op.Type, right);
        }

        return left;
    }

    private AstNode ParseOr()
    {
        var left = ParseAnd();
        while (Match(TokenType.KeywordOr))
        {
            var right = ParseAnd();
            left = new AstNode.Binary(left, TokenType.KeywordOr, right);
        }
        return left;
    }

    private AstNode ParseAnd()
    {
        var left = ParseEquality();
        while (Match(TokenType.KeywordAnd))
        {
            var right = ParseEquality();
            left = new AstNode.Binary(left, TokenType.KeywordAnd, right);
        }
        return left;
    }

    private AstNode ParseEquality()
    {
        var left = ParseComparison();
        while (Match(TokenType.OpEq) || Match(TokenType.OpNeq))
        {
            var op = Previous;
            var right = ParseComparison();
            left = new AstNode.Binary(left, op.Type, right);
        }
        return left;
    }

    private AstNode ParseComparison()
    {
        var left = ParseTerm();
        while (Match(TokenType.OpLt) || Match(TokenType.OpLe) ||
               Match(TokenType.OpGt) || Match(TokenType.OpGe))
        {
            var op = Previous;
            var right = ParseTerm();
            left = new AstNode.Binary(left, op.Type, right);
        }
        return left;
    }

    private AstNode ParseTerm()
    {
        var left = ParseFactor();
        while (Match(TokenType.OpPlus) || Match(TokenType.OpMinus))
        {
            var op = Previous;
            var right = ParseFactor();
            left = new AstNode.Binary(left, op.Type, right);
        }
        return left;
    }

    private AstNode ParseFactor()
    {
        var left = ParseUnary();
        while (Match(TokenType.OpStar) || Match(TokenType.OpSlash) || Match(TokenType.OpPercent))
        {
            var op = Previous;
            var right = ParseUnary();
            left = new AstNode.Binary(left, op.Type, right);
        }
        return left;
    }

    private AstNode ParseUnary()
    {
        if (Match(TokenType.OpMinus) || Match(TokenType.KeywordNot) || Match(TokenType.OpHash))
        {
            var op = Previous;
            var operand = ParseUnary();
            return new AstNode.Unary(op.Type, operand);
        }
        return ParsePostfix();
    }

    private AstNode ParsePostfix()
    {
        var expr = ParsePrimary();

        while (true)
        {
            if (Match(TokenType.LParen))
            {
                var args = new List<AstNode>();
                while (!Check(TokenType.RParen) && !IsAtEnd())
                {
                    args.Add(ParseExpression());
                    if (!Match(TokenType.Comma)) break;
                }
                Consume(TokenType.RParen, "Expected ')' after arguments");
                expr = new AstNode.Call(expr, args);
            }
            else if (Match(TokenType.LBracket))
            {
                var index = ParseExpression();
                Consume(TokenType.RBracket, "Expected ']' after index");
                expr = new AstNode.Index(expr, index);
            }
            else if (Match(TokenType.Dot))
            {
                string name = Consume(TokenType.Identifier, "Expected property name").Value;
                expr = new AstNode.Property(expr, name);
            }
            else if (Match(TokenType.OpOptionalChain))
            {
                string name = Consume(TokenType.Identifier, "Expected property name").Value;
                expr = new AstNode.OptionalProperty(expr, name);
            }
            else if (Match(TokenType.OpNullCoalesce))
            {
                var fallback = ParseExpression();
                expr = new AstNode.NullCoalesce(expr, fallback);
            }
            else break;
        }

        return expr;
    }

    private AstNode ParsePrimary()
    {
        return Current.Type switch
        {
            TokenType.KeywordNil => AdvanceAndReturn(new AstNode.Literal(null)),
            TokenType.KeywordTrue => AdvanceAndReturn(new AstNode.Literal(true)),
            TokenType.KeywordFalse => AdvanceAndReturn(new AstNode.Literal(false)),
            TokenType.Number => AdvanceAndReturn(new AstNode.Literal(double.Parse(Previous.Value))),
            TokenType.String => AdvanceAndReturn(new AstNode.Literal(Previous.Value)),
            TokenType.Identifier => AdvanceAndReturn(new AstNode.Variable(Previous.Value)),
            TokenType.LParen => ParseGrouping(),
            TokenType.LBracket => ParseArrayLiteral(),
            TokenType.LBrace => ParseTableLiteral(),
            TokenType.KeywordFn => ParseLambda(),
            TokenType.KeywordAsync => ParseAsyncLambda(),
            TokenType.KeywordMatch => ParseMatch(),
            TokenType.KeywordIf => ParseTernary(),
            _ => throw new ParseException($"Unexpected token: {Current.Value} at line {Current.Line}")
        };
    }

    private AstNode ParseGrouping()
    {
        Advance(); // (
        var expr = ParseExpression();
        Consume(TokenType.RParen, "Expected ')' after expression");
        return expr;
    }

    private AstNode ParseArrayLiteral()
    {
        Advance(); // [
        var elements = new List<AstNode>();
        while (!Check(TokenType.RBracket) && !IsAtEnd())
        {
            elements.Add(ParseExpression());
            if (!Match(TokenType.Comma)) break;
        }
        Consume(TokenType.RBracket, "Expected ']' after array elements");
        return new AstNode.ArrayLiteral(elements);
    }

    private AstNode ParseTableLiteral()
    {
        Advance(); // {
        var entries = new List<(AstNode Key, AstNode Value)>();
        while (!Check(TokenType.RBrace) && !IsAtEnd())
        {
            AstNode key;
            if (Check(TokenType.Identifier) && Peek(1).Type == TokenType.Colon)
            {
                key = new AstNode.Literal(Advance().Value);
                Advance(); // :
            }
            else if (Check(TokenType.LBracket))
            {
                Advance(); // [
                key = ParseExpression();
                Consume(TokenType.RBracket, "Expected ']' after key");
                Consume(TokenType.Colon, "Expected ':' after key");
            }
            else
            {
                throw new ParseException("Expected table key");
            }

            var value = ParseExpression();
            entries.Add((key, value));
            if (!Match(TokenType.Comma)) break;
        }
        Consume(TokenType.RBrace, "Expected '}' after table entries");
        return new AstNode.TableLiteral(entries);
    }

    private AstNode ParseLambda()
    {
        Advance(); // fn
        Consume(TokenType.LParen, "Expected '(' after fn");
        var parameters = new List<(string Name, string? Type)>();
        while (!Check(TokenType.RParen) && !IsAtEnd())
        {
            string pname = Consume(TokenType.Identifier, "Expected parameter name").Value;
            string? ptype = null;
            if (Match(TokenType.Colon))
                ptype = ParseTypeExpression();
            parameters.Add((pname, ptype));
            if (!Match(TokenType.Comma)) break;
        }
        Consume(TokenType.RParen, "Expected ')' after parameters");
        var body = ParseBlock();
        return new AstNode.Lambda(parameters, body);
    }

    private AstNode ParseTernary()
    {
        Advance(); // if
        var condition = ParseExpression();
        Consume(TokenType.KeywordElse, "Expected 'else' in ternary");
        var thenExpr = ParseExpression();
        Consume(TokenType.KeywordElse, "Expected second 'else' in ternary");
        var elseExpr = ParseExpression();
        return new AstNode.Ternary(condition, thenExpr, elseExpr);
    }

    private string ParseTypeExpression()
    {
        // Simplified type parser
        var parts = new List<string>();
        while (!IsAtEnd() && !Check(TokenType.OpAssign) && !Check(TokenType.Comma) &&
               !Check(TokenType.RParen) && !Check(TokenType.RBrace) && !Check(TokenType.Semicolon))
        {
            parts.Add(Advance().Value);
        }
        return string.Join(" ", parts);
    }

    private AstNode ParsePattern() => ParseExpression();
    private AstNode ParseExprStatement() => new AstNode.ExprStmt(ParseExpression());
    private AstNode ParseReturn() { Advance(); var val = IsAtEnd() || Check(TokenType.Semicolon) ? null : ParseExpression(); Match(TokenType.Semicolon); return new AstNode.Return(val); }
    private AstNode ParseBreak() { Advance(); Match(TokenType.Semicolon); return new AstNode.Break(); }
    private AstNode ParseContinue() { Advance(); Match(TokenType.Semicolon); return new AstNode.Continue(); }
    private AstNode ParseAsync() { Advance(); return ParseFnDecl(); } // Mark as async
    private AstNode ParseDefer() { Advance(); return new AstNode.Defer(ParseExpression()); }
    private AstNode ParseGuard() { Advance(); var cond = ParseExpression(); var body = ParseBlock(); return new AstNode.Guard(cond, body); }
    private AstNode ParseEnum() { Advance(); var name = Consume(TokenType.Identifier, "Expected enum name").Value; Consume(TokenType.LBrace, "{"); var variants = new List<string>(); while (!Check(TokenType.RBrace) && !IsAtEnd()) { variants.Add(Consume(TokenType.Identifier, "Expected variant").Value); Match(TokenType.Comma); } Consume(TokenType.RBrace, "}"); return new AstNode.EnumDecl(name, variants); }
    private AstNode ParseTrait() { Advance(); var name = Consume(TokenType.Identifier, "Expected trait name").Value; var body = ParseBlock(); return new AstNode.TraitDecl(name, body); }
    private AstNode ParseImpl() { Advance(); var target = Consume(TokenType.Identifier, "Expected impl target").Value; var body = ParseBlock(); return new AstNode.ImplDecl(target, body); }
    private AstNode ParseImport() { Advance(); var path = Consume(TokenType.String, "Expected import path").Value; Match(TokenType.Semicolon); return new AstNode.Import(path); }
    private AstNode ParseExport() { Advance(); return new AstNode.Export(ParseStatement()); }
    private AstNode ParseAsyncLambda() { Advance(); return ParseLambda(); }

    private Token Current => _tokens[_pos];
    private Token Previous => _tokens[_pos - 1];
    private bool IsAtEnd() => Current.Type == TokenType.EOF;
    private bool Check(TokenType type) => Current.Type == type;

    private bool Match(TokenType type)
    {
        if (Check(type)) { Advance(); return true; }
        return false;
    }

    private Token Advance()
    {
        if (!IsAtEnd()) _pos++;
        return Previous;
    }

    private Token Peek(int offset) => _pos + offset < _tokens.Count ? _tokens[_pos + offset] : _tokens[^1];

    private AstNode AdvanceAndReturn(AstNode node)
    {
        Advance();
        return node;
    }

    private Token Consume(TokenType type, string message)
    {
        if (Check(type)) return Advance();
        throw new ParseException($"{message} at line {Current.Line}, got {Current.Value}");
    }
}

// AST Node definitions
public abstract record AstNode
{
    public record Block(List<AstNode> Statements) : AstNode;
    public record VarDecl(string Name, bool IsConst, string? TypeAnnotation, AstNode? Init) : AstNode;
    public record FnDecl(string Name, List<(string Name, string? Type)> Parameters, string? ReturnType, AstNode Body) : AstNode;
    public record If(AstNode Condition, AstNode ThenBranch, AstNode? ElseBranch) : AstNode;
    public record While(AstNode Condition, AstNode Body) : AstNode;
    public record For(string VarName, AstNode Iterable, AstNode Body) : AstNode;
    public record Match(AstNode Expression, List<(AstNode Pattern, AstNode Body)> Arms) : AstNode;
    public record StructDecl(string Name, List<(string Name, string Type, AstNode? Default)> Fields) : AstNode;
    public record EnumDecl(string Name, List<string> Variants) : AstNode;
    public record TraitDecl(string Name, AstNode Body) : AstNode;
    public record ImplDecl(string Target, AstNode Body) : AstNode;
    public record Import(string Path) : AstNode;
    public record Export(AstNode Declaration) : AstNode;
    public record Defer(AstNode Expression) : AstNode;
    public record Guard(AstNode Condition, AstNode Body) : AstNode;
    public record Return(AstNode? Value) : AstNode;
    public record Break() : AstNode;
    public record Continue() : AstNode;
    public record ExprStmt(AstNode Expression) : AstNode;

    public record Binary(AstNode Left, TokenType Op, AstNode Right) : AstNode;
    public record Unary(TokenType Op, AstNode Operand) : AstNode;
    public record Assign(AstNode Target, TokenType Op, AstNode Value) : AstNode;
    public record Call(AstNode Callee, List<AstNode> Arguments) : AstNode;
    public record Index(AstNode Target, AstNode Key) : AstNode;
    public record Property(AstNode Target, string Name) : AstNode;
    public record OptionalProperty(AstNode Target, string Name) : AstNode;
    public record NullCoalesce(AstNode Value, AstNode Fallback) : AstNode;
    public record Lambda(List<(string Name, string? Type)> Parameters, AstNode Body) : AstNode;
    public record Ternary(AstNode Condition, AstNode ThenExpr, AstNode ElseExpr) : AstNode;
    public record ArrayLiteral(List<AstNode> Elements) : AstNode;
    public record TableLiteral(List<(AstNode Key, AstNode Value)> Entries) : AstNode;
    public record Literal(object? Value) : AstNode;
    public record Variable(string Name) : AstNode;
}

public class ParseException : Exception
{
    public ParseException(string message) : base(message) { }
}
