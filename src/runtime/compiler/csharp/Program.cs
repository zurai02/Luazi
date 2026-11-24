using System;
using System.Collections.Generic;
using System.IO;

namespace Luazi.Compiler;

/// <summary>
/// CLI entry point for the Luazi C# Compiler (lzc).
/// </summary>
public static class Program
{
    /// <summary>
    /// Main entry point.
    /// </summary>
    /// <param name="args">Command-line arguments.</param>
    /// <returns>Exit code.</returns>
    public static int Main(string[] args)
    {
        Console.WriteLine("Luazi Compiler (C# Frontend)");
        if (args.Length == 0)
        {
            Console.WriteLine("Usage: lzc <file.lzki>");
            return 0;
        }

        string file = args[0];
        if (!File.Exists(file))
        {
            Console.Error.WriteLine($"File not found: {file}");
            return 1;
        }

        try
        {
            string source = File.ReadAllText(file);
            var tokenizer = new LzTokenizer(source.AsSpan());
            var tokens = new List<Token>();
            Token tok;
            do
            {
                tok = tokenizer.NextToken();
                tokens.Add(tok);
            } while (tok.Type != TokenType.EOF);

            var parser = new LzParser(tokens);
            var ast = parser.Parse();
            Console.WriteLine($"Successfully parsed {file} ({tokens.Count} tokens)");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error compiling {file}: {ex.Message}");
            return 1;
        }
    }
}
