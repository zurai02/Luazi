// Luazi Virtual Machine Core
// Written in C# 12 with unsafe optimizations

using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Luazi.Runtime;

/// <summary>
/// The Luazi Value Type - tagged union optimized for cache locality
/// Uses 16 bytes: 8 for tag + 8 for payload (or pointer)
/// </summary>
[StructLayout(LayoutKind.Explicit, Size = 16)]
public struct LzValue
{
    [FieldOffset(0)] public LzType Tag;
    [FieldOffset(8)] public double Number;
    [FieldOffset(8)] public ulong Bits;
    [FieldOffset(8)] public nint Pointer;  // Object reference

    public static LzValue Nil => new() { Tag = LzType.Nil };
    public static LzValue Bool(bool v) => new() { Tag = LzType.Bool, Bits = v ? 1UL : 0UL };
    public static LzValue Num(double v) => new() { Tag = LzType.Number, Number = v };
    public static LzValue Str(LzString v) => new() { Tag = LzType.String, Pointer = v.Handle };
    public static LzValue Obj(LzObject v) => new() { Tag = LzType.Object, Pointer = v.Handle };
    public static LzValue Fn(LzFunction v) => new() { Tag = LzType.Function, Pointer = v.Handle };

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsNil() => Tag == LzType.Nil;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsNumber() => Tag == LzType.Number;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public double AsNumber() => Number;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool AsBool() => Bits != 0;
}

public enum LzType : byte
{
    Nil = 0,
    Bool = 1,
    Number = 2,
    String = 3,
    Object = 4,
    Function = 5,
    Table = 6,
    Thread = 7,
    UserData = 8
}

/// <summary>
/// Arena allocator - zero-GC pressure for short-lived objects
/// </summary>
public sealed unsafe class ArenaAllocator : IDisposable
{
    private byte* _base;
    private nuint _capacity;
    private nuint _offset;
    private readonly List<nint> _pages = new();

    public const int PageSize = 65536; // 64KB pages

    public ArenaAllocator(nuint initialCapacity = 1048576) // 1MB default
    {
        _base = (byte*)NativeMemory.AlignedAlloc(initialCapacity, 64);
        _capacity = initialCapacity;
        _offset = 0;
        _pages.Add((nint)_base);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void* Alloc(nuint size)
    {
        size = (size + 7) & ~(nuint)7; // 8-byte align
        if (_offset + size > _capacity)
        {
            Grow(size);
        }
        void* ptr = _base + _offset;
        _offset += size;
        return ptr;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void* AllocZeroed(nuint size)
    {
        void* ptr = Alloc(size);
        NativeMemory.Clear(ptr, size);
        return ptr;
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private void Grow(nuint minimum)
    {
        nuint newSize = Math.Max(_capacity * 2, minimum);
        newSize = Math.Max(newSize, (nuint)PageSize);
        byte* newBase = (byte*)NativeMemory.AlignedAlloc(newSize, 64);
        Buffer.MemoryCopy(_base, newBase, (long)_offset, (long)_offset);
        NativeMemory.AlignedFree(_base);
        _base = newBase;
        _capacity = newSize;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void Reset()
    {
        _offset = 0;
    }

    public void Dispose()
    {
        foreach (var page in _pages)
        {
            NativeMemory.AlignedFree((void*)page);
        }
        _pages.Clear();
    }
}

/// <summary>
/// Generational Garbage Collector
/// Nursery (Gen0) -> Survivor (Gen1) -> Tenured (Gen2)
/// </summary>
public sealed class GenerationalGC
{
    private readonly List<LzObject> _nursery = new(4096);
    private readonly List<LzObject> _survivors = new(2048);
    private readonly List<LzObject> _tenured = new(1024);
    private int _collectionCount = 0;

    public void Track(LzObject obj)
    {
        _nursery.Add(obj);
        if (_nursery.Count > 4096)
        {
            CollectGen0();
        }
    }

    public void CollectGen0()
    {
        var alive = _nursery.Where(o => o.IsReachable).ToList();
        _nursery.Clear();

        foreach (var obj in alive)
        {
            obj.Generation++;
            if (obj.Generation >= 2)
                _tenured.Add(obj);
            else
                _survivors.Add(obj);
        }

        _collectionCount++;
        if (_collectionCount % 10 == 0)
            CollectGen1();
    }

    private void CollectGen1()
    {
        var alive = _survivors.Where(o => o.IsReachable).ToList();
        _survivors.Clear();
        foreach (var obj in alive)
        {
            obj.Generation++;
            _tenured.Add(obj);
        }
    }

    public (int Nursery, int Survivors, int Tenured) Stats =>
        (_nursery.Count, _survivors.Count, _tenured.Count);
}

/// <summary>
/// Luazi Virtual Machine - Stack-based with register window optimization
/// </summary>
public sealed class LzVM
{
    private readonly LzValue[] _stack;
    private readonly LzValue[] _constants;
    private readonly byte[] _bytecode;
    private int _pc = 0;      // Program counter
    private int _sp = 0;      // Stack pointer
    private int _fp = 0;      // Frame pointer

    private readonly ArenaAllocator _arena;
    private readonly GenerationalGC _gc;
    private readonly Dictionary<string, LzValue> _globals = new();

    // Opcode dispatch table - cached for performance
    private readonly Action[] _dispatch;

    public LzVM(int stackSize = 65536, int constPool = 4096)
    {
        _stack = new LzValue[stackSize];
        _constants = new LzValue[constPool];
        _bytecode = Array.Empty<byte>();
        _arena = new ArenaAllocator();
        _gc = new GenerationalGC();
        _dispatch = BuildDispatchTable();
    }

    private Action[] BuildDispatchTable()
    {
        return new Action[]
        {
            OpNop, OpLoadK, OpLoadNil, OpLoadBool,
            OpLoadInt, OpMove, OpGetGlobal, OpSetGlobal,
            OpGetUpval, OpSetUpval, OpGetTable, OpSetTable,
            OpNewTable, OpSelf, OpAdd, OpSub,
            OpMul, OpDiv, OpMod, OpPow,
            OpUnm, OpNot, OpLen, OpConcat,
            OpJmp, OpEq, OpLt, OpLe,
            OpTest, OpTestSet, OpCall, OpTailCall,
            OpReturn, OpForLoop, OpForPrep, OpTForLoop,
            OpSetList, OpClose, OpClosure, OpVararg,
            // Extended opcodes for Luazi
            OpTypeCheck, OpAssert, OpAsync, OpAwait,
            OpSimdAdd, OpSimdMul, OpSimdDot
        };
    }

    #region Bytecode Execution

    public void Load(byte[] bytecode)
    {
        _bytecode = bytecode;
        _pc = 0;
        _sp = 0;
    }

    public LzValue Execute()
    {
        while (_pc < _bytecode.Length)
        {
            byte opcode = _bytecode[_pc++];
            if (opcode < _dispatch.Length)
                _dispatch[opcode]();
            else
                throw new LzRuntimeException($"Unknown opcode: {opcode}");
        }
        return _sp > 0 ? _stack[_sp - 1] : LzValue.Nil;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private byte NextByte() => _bytecode[_pc++];

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private ushort NextU16() => (ushort)(NextByte() | (NextByte() << 8));

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private uint NextU32() => (uint)(NextU16() | (NextU16() << 16));

    #endregion

    #region Core Opcodes

    private void OpNop() { }

    private void OpLoadK()
    {
        byte reg = NextByte();
        ushort kidx = NextU16();
        _stack[_fp + reg] = _constants[kidx];
    }

    private void OpLoadNil()
    {
        byte reg = NextByte();
        _stack[_fp + reg] = LzValue.Nil;
    }

    private void OpLoadBool()
    {
        byte reg = NextByte();
        byte val = NextByte();
        _stack[_fp + reg] = LzValue.Bool(val != 0);
    }

    private void OpLoadInt()
    {
        byte reg = NextByte();
        int val = (int)NextU32();
        _stack[_fp + reg] = LzValue.Num(val);
    }

    private void OpMove()
    {
        byte dst = NextByte();
        byte src = NextByte();
        _stack[_fp + dst] = _stack[_fp + src];
    }

    private void OpAdd()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        _stack[_fp + dst] = LzValue.Num(
            _stack[_fp + left].AsNumber() + _stack[_fp + right].AsNumber()
        );
    }

    private void OpSub()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        _stack[_fp + dst] = LzValue.Num(
            _stack[_fp + left].AsNumber() - _stack[_fp + right].AsNumber()
        );
    }

    private void OpMul()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        _stack[_fp + dst] = LzValue.Num(
            _stack[_fp + left].AsNumber() * _stack[_fp + right].AsNumber()
        );
    }

    private void OpDiv()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        double r = _stack[_fp + right].AsNumber();
        if (r == 0) throw new LzRuntimeException("Division by zero");
        _stack[_fp + dst] = LzValue.Num(_stack[_fp + left].AsNumber() / r);
    }

    private void OpJmp()
    {
        short offset = (short)NextU16();
        _pc += offset;
    }

    private void OpEq()
    {
        byte left = NextByte();
        byte right = NextByte();
        byte cond = NextByte();
        bool eq = _stack[_fp + left].Bits == _stack[_fp + right].Bits &&
                  _stack[_fp + left].Tag == _stack[_fp + right].Tag;
        if (eq != (cond != 0))
            _pc += 2; // Skip next jmp
    }

    private void OpLt()
    {
        byte left = NextByte();
        byte right = NextByte();
        byte cond = NextByte();
        bool lt = _stack[_fp + left].AsNumber() < _stack[_fp + right].AsNumber();
        if (lt != (cond != 0))
            _pc += 2;
    }

    private void OpCall()
    {
        byte funcReg = NextByte();
        byte argCount = NextByte();
        byte retCount = NextByte();
        // Function call implementation with tail-call optimization check
        var fn = _stack[_fp + funcReg];
        // ... call logic
    }

    private void OpReturn()
    {
        byte startReg = NextByte();
        byte count = NextByte();
        // Return values
    }

    #endregion

    #region Luazi Extended Opcodes

    private void OpTypeCheck()
    {
        byte reg = NextByte();
        byte expected = NextByte();
        var val = _stack[_fp + reg];
        if ((byte)val.Tag != expected)
        {
            throw new LzTypeException(
                $"Type mismatch: expected {(LzType)expected}, got {val.Tag}");
        }
    }

    private void OpAssert()
    {
        byte reg = NextByte();
        ushort msgIdx = NextU16();
        if (!_stack[_fp + reg].AsBool())
        {
            throw new LzAssertException(
                $"Assertion failed: {_constants[msgIdx]}");
        }
    }

    private void OpAsync()
    {
        // Mark function as async - creates promise-like handle
        byte funcReg = NextByte();
        // Wrap function in async handle
    }

    private void OpAwait()
    {
        byte reg = NextByte();
        // Yield current coroutine, resume when promise resolves
    }

    private void OpSimdAdd()
    {
        // SIMD vector addition - 4 doubles at once
        byte dst = NextByte();
        byte a = NextByte();
        byte b = NextByte();
        // Uses hardware SIMD if available
        SimdAdd4(ref _stack[_fp + dst], ref _stack[_fp + a], ref _stack[_fp + b]);
    }

    private void OpSimdMul() { /* SIMD multiply */ }
    private void OpSimdDot() { /* SIMD dot product */ }

    #endregion

    #region SIMD Helpers

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static void SimdAdd4(ref LzValue dst, ref LzValue a, ref LzValue b)
    {
        // In real implementation, uses System.Runtime.Intrinsics
        // For now, scalar fallback
        dst = LzValue.Num(a.AsNumber() + b.AsNumber());
    }

    #endregion

    #region Public API

    public void SetGlobal(string name, LzValue value)
    {
        _globals[name] = value;
    }

    public LzValue GetGlobal(string name)
    {
        return _globals.TryGetValue(name, out var v) ? v : LzValue.Nil;
    }

    public (int Nursery, int Survivors, int Tenured) GCStats => _gc.Stats;

    public void ForceGC()
    {
        _gc.CollectGen0();
    }

    #endregion
}

// Placeholder types for compilation
public class LzString { public nint Handle; }
public class LzObject { public nint Handle; public int Generation; public bool IsReachable; }
public class LzFunction { public nint Handle; }

public class LzRuntimeException : Exception
{
    public LzRuntimeException(string msg) : base(msg) { }
}

public class LzTypeException : LzRuntimeException
{
    public LzTypeException(string msg) : base(msg) { }
}

public class LzAssertException : LzRuntimeException
{
    public LzAssertException(string msg) : base(msg) { }
}
