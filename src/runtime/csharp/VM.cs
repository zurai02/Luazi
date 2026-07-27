// Luazi Virtual Machine Core
// Written in C# 12 with unsafe optimizations

using System;
using System.Collections.Generic;
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
    [FieldOffset(8)] public nint Pointer; // Object reference

    public static LzValue Nil => new() { Tag = LzType.Nil };
    public static LzValue Bool(bool v) => new() { Tag = LzType.Bool, Bits = v ? 1UL : 0UL };
    public static LzValue Num(double v) => new() { Tag = LzType.Number, Number = v };
    public static LzValue Str(LzString v) => new() { Tag = LzType.String, Pointer = v.Handle };
    public static LzValue Obj(LzObject v) => new() { Tag = LzType.Object, Pointer = v.Handle };
    public static LzValue Fn(LzFunction v) => new() { Tag = LzType.Function, Pointer = v.Handle };
    public static LzValue Tbl(LzTable v) => new() { Tag = LzType.Table, Pointer = v.Handle };

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsNil() => Tag == LzType.Nil;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsBool() => Tag == LzType.Bool;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsNumber() => Tag == LzType.Number;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsString() => Tag == LzType.String;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsTable() => Tag == LzType.Table;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool IsFunction() => Tag == LzType.Function;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public double AsNumber() => Number;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public bool AsBool() => Tag != LzType.Nil && (Tag != LzType.Bool || Bits != 0) && (Tag != LzType.Number || Number != 0);

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public string AsString()
    {
        if (Tag == LzType.String)
        {
            unsafe
            {
                return new string((sbyte*)Pointer);
            }
        }
        if (Tag == LzType.Number) return Number.ToString();
        if (Tag == LzType.Nil) return "nil";
        if (Tag == LzType.Bool) return Bits != 0 ? "true" : "false";
        return "[object]";
    }
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
/// Simple table implementation using Dictionary
/// </summary>
public sealed class LzTable
{
    public nint Handle;
    public Dictionary<string, LzValue> Data = new();
    public int Count => Data.Count;
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
/// Luazi Virtual Machine - Stack-based with register window optimization
/// </summary>
public sealed class LzVM
{
    private readonly LzValue[] _stack;
    private readonly LzValue[] _constants;
    private byte[] _bytecode = Array.Empty<byte>();
    private int _pc = 0; // Program counter
    private int _sp = 0; // Stack pointer
    private int _fp = 0; // Frame pointer

    private readonly ArenaAllocator _arena;
    private readonly Dictionary<string, LzValue> _globals = new();
    private readonly List<LzTable> _tables = new();

    // Opcode dispatch table - cached for performance
    private readonly Action[] _dispatch;

    public LzVM(int stackSize = 65536, int constPool = 4096)
    {
        _stack = new LzValue[stackSize];
        _constants = new LzValue[constPool];
        _arena = new ArenaAllocator();
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

    #region Bytecode Loading

    public void Load(byte[] bytecode)
    {
        _bytecode = bytecode;
        _pc = 0;
        _sp = 0;
        _fp = 0;

        if (bytecode.Length < 12) throw new LzRuntimeException("Bytecode too small");

        // Parse header
        uint magic = BitConverter.ToUInt32(bytecode, 0);
        if (magic != 0x4C5A494D) throw new LzRuntimeException("Invalid bytecode magic");

        byte version = bytecode[4];
        byte flags = bytecode[5];
        ushort constCount = BitConverter.ToUInt16(bytecode, 6);
        ushort protoCount = BitConverter.ToUInt16(bytecode, 8);
        uint codeSize = BitConverter.ToUInt32(bytecode, 10);

        int offset = 12;

        // Load constants
        for (int i = 0; i < constCount && i < _constants.Length; i++)
        {
            byte type = bytecode[offset++];
            switch (type)
            {
                case 0:
                    _constants[i] = LzValue.Nil;
                    break;
                case 1:
                    _constants[i] = LzValue.Num(BitConverter.ToDouble(bytecode, offset));
                    offset += 8;
                    break;
                case 2:
                    _constants[i] = LzValue.Bool(true);
                    break;
                case 3:
                    int len = BitConverter.ToInt32(bytecode, offset);
                    offset += 4;
                    string str = System.Text.Encoding.UTF8.GetString(bytecode, offset, len);
                    offset += len;
                    _constants[i] = LzValue.Str(new LzString { Handle = (nint)GCHandle.ToIntPtr(GCHandle.Alloc(str)) });
                    break;
            }
        }

        // Skip proto table and proto data
        for (int i = 0; i < protoCount; i++)
        {
            offset += 8;
        }

        for (int i = 0; i < protoCount; i++)
        {
            int pConsts = BitConverter.ToInt32(bytecode, offset);
            offset += 4;
            int pInsts = BitConverter.ToInt32(bytecode, offset);
            offset += 4;
            int pUpvals = BitConverter.ToInt32(bytecode, offset);
            offset += 4;
            int pParams = BitConverter.ToInt32(bytecode, offset);
            offset += 4;

            for (int j = 0; j < pConsts; j++)
            {
                byte t = bytecode[offset++];
                if (t == 1) offset += 8;
                else if (t == 3)
                {
                    int slen = BitConverter.ToInt32(bytecode, offset);
                    offset += 4 + slen;
                }
            }

            offset += pInsts * 4 + pUpvals * 4;

            for (int j = 0; j < pUpvals; j++)
            {
                offset += 4;
                int nameLen = bytecode[offset++];
                offset += nameLen;
            }
        }

        // Code starts here
        _pc = offset;
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

    #region Stack Helpers

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private LzValue GetReg(byte idx) => _stack[_fp + idx];

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private void SetReg(byte idx, LzValue val) => _stack[_fp + idx] = val;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private LzValue GetRK(ushort idx) => idx >= 256 ? _constants[idx - 256] : GetReg((byte)idx);

    #endregion

    #region Core Opcodes

    private void OpNop() { }

    private void OpLoadK()
    {
        byte reg = NextByte();
        ushort kidx = NextU16();
        SetReg(reg, _constants[kidx]);
    }

    private void OpLoadNil()
    {
        byte reg = NextByte();
        SetReg(reg, LzValue.Nil);
    }

    private void OpLoadBool()
    {
        byte reg = NextByte();
        byte val = NextByte();
        byte skip = NextByte();
        SetReg(reg, LzValue.Bool(val != 0));
        if (skip != 0) _pc += 4;
    }

    private void OpLoadInt()
    {
        byte reg = NextByte();
        int val = (int)NextU32();
        SetReg(reg, LzValue.Num(val));
    }

    private void OpMove()
    {
        byte dst = NextByte();
        byte src = NextByte();
        SetReg(dst, GetReg(src));
    }

    private void OpGetGlobal()
    {
        byte dst = NextByte();
        ushort kidx = NextU16();
        string name = _constants[kidx].AsString();
        SetReg(dst, _globals.TryGetValue(name, out var v) ? v : LzValue.Nil);
    }

    private void OpSetGlobal()
    {
        byte src = NextByte();
        ushort kidx = NextU16();
        string name = _constants[kidx].AsString();
        _globals[name] = GetReg(src);
    }

    private void OpGetUpval() { /* TODO */ }
    private void OpSetUpval() { /* TODO */ }

    private void OpGetTable()
    {
        byte dst = NextByte();
        byte tbl = NextByte();
        ushort key = NextU16();
        var table = GetReg(tbl);
        if (table.IsTable())
        {
            unsafe
            {
                var t = (LzTable*)table.Pointer;
                string k = GetRK(key).AsString();
                SetReg(dst, t->Data.TryGetValue(k, out var v) ? v : LzValue.Nil);
            }
        }
        else
        {
            SetReg(dst, LzValue.Nil);
        }
    }

    private void OpSetTable()
    {
        byte tbl = NextByte();
        ushort key = NextU16();
        ushort val = NextU16();
        var table = GetReg(tbl);
        if (table.IsTable())
        {
            unsafe
            {
                var t = (LzTable*)table.Pointer;
                string k = GetRK(key).AsString();
                t->Data[k] = GetRK(val);
            }
        }
    }

    private void OpNewTable()
    {
        byte dst = NextByte();
        var tbl = new LzTable();
        _tables.Add(tbl);
        unsafe
        {
            tbl.Handle = (nint)GCHandle.ToIntPtr(GCHandle.Alloc(tbl));
        }
        SetReg(dst, LzValue.Tbl(tbl));
    }

    private void OpSelf() { /* TODO */ }

    private void OpAdd()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        SetReg(dst, LzValue.Num(
            GetReg(left).AsNumber() + GetReg(right).AsNumber()
        ));
    }

    private void OpSub()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        SetReg(dst, LzValue.Num(
            GetReg(left).AsNumber() - GetReg(right).AsNumber()
        ));
    }

    private void OpMul()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        SetReg(dst, LzValue.Num(
            GetReg(left).AsNumber() * GetReg(right).AsNumber()
        ));
    }

    private void OpDiv()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        double r = GetReg(right).AsNumber();
        if (r == 0) throw new LzRuntimeException("Division by zero");
        SetReg(dst, LzValue.Num(GetReg(left).AsNumber() / r));
    }

    private void OpMod()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        SetReg(dst, LzValue.Num(
            GetReg(left).AsNumber() % GetReg(right).AsNumber()
        ));
    }

    private void OpPow()
    {
        byte dst = NextByte();
        byte left = NextByte();
        byte right = NextByte();
        SetReg(dst, LzValue.Num(
            Math.Pow(GetReg(left).AsNumber(), GetReg(right).AsNumber())
        ));
    }

    private void OpUnm()
    {
        byte dst = NextByte();
        byte src = NextByte();
        SetReg(dst, LzValue.Num(-GetReg(src).AsNumber()));
    }

    private void OpNot()
    {
        byte dst = NextByte();
        byte src = NextByte();
        SetReg(dst, LzValue.Bool(!GetReg(src).AsBool()));
    }

    private void OpLen()
    {
        byte dst = NextByte();
        byte src = NextByte();
        var val = GetReg(src);
        if (val.IsString())
        {
            SetReg(dst, LzValue.Num(val.AsString().Length));
        }
        else if (val.IsTable())
        {
            unsafe
            {
                var t = (LzTable*)val.Pointer;
                SetReg(dst, LzValue.Num(t->Count));
            }
        }
        else
        {
            SetReg(dst, LzValue.Num(0));
        }
    }

    private void OpConcat()
    {
        byte dst = NextByte();
        byte start = NextByte();
        byte end = NextByte();
        string result = "";
        for (int i = start; i <= end; i++)
        {
            result += GetReg((byte)i).AsString();
        }
        SetReg(dst, LzValue.Str(new LzString { Handle = (nint)GCHandle.ToIntPtr(GCHandle.Alloc(result)) }));
    }

    private void OpJmp()
    {
        short offset = (short)NextU16();
        _pc += offset * 4;
    }

    private void OpEq()
    {
        byte left = NextByte();
        byte right = NextByte();
        byte cond = NextByte();
        bool eq = GetReg(left).AsNumber() == GetReg(right).AsNumber();
        if (eq != (cond != 0))
            _pc += 4;
    }

    private void OpLt()
    {
        byte left = NextByte();
        byte right = NextByte();
        byte cond = NextByte();
        bool lt = GetReg(left).AsNumber() < GetReg(right).AsNumber();
        if (lt != (cond != 0))
            _pc += 4;
    }

    private void OpLe()
    {
        byte left = NextByte();
        byte right = NextByte();
        byte cond = NextByte();
        bool le = GetReg(left).AsNumber() <= GetReg(right).AsNumber();
        if (le != (cond != 0))
            _pc += 4;
    }

    private void OpTest()
    {
        byte reg = NextByte();
        byte cond = NextByte();
        if (GetReg(reg).AsBool() != (cond != 0))
            _pc += 4;
    }

    private void OpTestSet()
    {
        byte dst = NextByte();
        byte src = NextByte();
        byte cond = NextByte();
        var val = GetReg(src);
        if (val.AsBool() == (cond != 0))
        {
            SetReg(dst, val);
        }
        else
        {
            _pc += 4;
        }
    }

    private void OpCall()
    {
        byte funcReg = NextByte();
        byte argCount = NextByte();
        byte retCount = NextByte();
        // Simplified: set result to nil
        SetReg(funcReg, LzValue.Nil);
    }

    private void OpTailCall()
    {
        byte funcReg = NextByte();
        byte argCount = NextByte();
        byte retCount = NextByte();
        SetReg(funcReg, LzValue.Nil);
    }

    private void OpReturn()
    {
        byte startReg = NextByte();
        byte count = NextByte();
        // Return values
    }

    private void OpForLoop()
    {
        byte reg = NextByte();
        short offset = (short)NextU16();
        double idx = GetReg(reg).AsNumber() + GetReg((byte)(reg + 2)).AsNumber();
        double limit = GetReg((byte)(reg + 1)).AsNumber();
        double step = GetReg((byte)(reg + 2)).AsNumber();
        SetReg(reg, LzValue.Num(idx));
        if ((step > 0 && idx <= limit) || (step < 0 && idx >= limit))
        {
            _pc += offset * 4;
            SetReg((byte)(reg + 3), LzValue.Num(idx));
        }
    }

    private void OpForPrep()
    {
        byte reg = NextByte();
        short offset = (short)NextU16();
        double init = GetReg(reg).AsNumber();
        double step = GetReg((byte)(reg + 2)).AsNumber();
        SetReg(reg, LzValue.Num(init - step));
        _pc += offset * 4;
    }

    private void OpTForLoop() { /* TODO */ }
    private void OpSetList() { /* TODO */ }
    private void OpClose() { /* TODO */ }

    private void OpClosure()
    {
        byte dst = NextByte();
        ushort protoIdx = NextU16();
        SetReg(dst, LzValue.Fn(new LzFunction()));
    }

    private void OpVararg() { /* TODO */ }

    #endregion

    #region Luazi Extended Opcodes

    private void OpTypeCheck()
    {
        byte reg = NextByte();
        byte expected = NextByte();
        var val = GetReg(reg);
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
        if (!GetReg(reg).AsBool())
        {
            throw new LzAssertException(
                $"Assertion failed: {_constants[msgIdx].AsString()}");
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
        byte dst = NextByte();
        byte src = NextByte();
        SetReg(dst, GetReg(src));
    }

    private void OpSimdAdd()
    {
        // SIMD vector addition - 4 doubles at once
        byte dst = NextByte();
        byte a = NextByte();
        byte b = NextByte();
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

    public (int Nursery, int Survivors, int Tenured) GCStats => (0, 0, 0);

    public void ForceGC()
    {
        // Simplified GC
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
