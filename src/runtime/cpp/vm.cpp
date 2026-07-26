// Luazi C++ Runtime Header
// Optimized for WASM compilation with Emscripten
// Zero-cost abstractions, cache-friendly data layouts

#ifndef LUAZI_VM_H
#define LUAZI_VM_H

#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cmath>
#include <vector>
#include <string>
#include <unordered_map>
#include <memory>
#include <functional>

// Platform detection
#ifdef __EMSCRIPTEN__
    #define LZ_WASM 1
    #include <emscripten.h>
#else
    #define LZ_NATIVE 1
#endif

// Force inline for hot paths
#ifdef _MSC_VER
    #define LZ_INLINE __forceinline
#else
    #define LZ_INLINE __attribute__((always_inline)) inline
#endif

// Branch prediction hints
#define LZ_LIKELY(x)   __builtin_expect(!!(x), 1)
#define LZ_UNLIKELY(x) __builtin_expect(!!(x), 0)

// Cache line size (common on x86_64 and ARM64)
#define LZ_CACHE_LINE 64
#define LZ_ALIGN_CACHE __attribute__((aligned(LZ_CACHE_LINE)))

namespace luazi {

// ============================================================================
// VALUE SYSTEM - NaN Boxing (inspired by LuaJIT)
// ============================================================================
// Uses IEEE 754 NaN payload to store non-number values inline
// Numbers: actual double
// Everything else: encoded in the NaN payload

enum class Type : uint8_t {
    Nil      = 0,
    Bool     = 1,
    Number   = 2,
    String   = 3,
    Table    = 4,
    Function = 5,
    Thread   = 6,
    UserData = 7,
    LightUD  = 8
};

// NaN boxing constants
static constexpr uint64_t LZ_NAN_MASK     = 0x7FF8000000000000ULL;
static constexpr uint64_t LZ_TAG_NIL      = 0x7FF8000000000001ULL;
static constexpr uint64_t LZ_TAG_FALSE    = 0x7FF8000000000002ULL;
static constexpr uint64_t LZ_TAG_TRUE     = 0x7FF8000000000003ULL;
static constexpr uint64_t LZ_TAG_STRING   = 0x7FF8000000000004ULL;
static constexpr uint64_t LZ_TAG_TABLE    = 0x7FF8000000000005ULL;
static constexpr uint64_t LZ_TAG_FUNCTION = 0x7FF8000000000006ULL;
static constexpr uint64_t LZ_TAG_THREAD   = 0x7FF8000000000007ULL;
static constexpr uint64_t LZ_TAG_PTR_MASK = 0x0000FFFFFFFFFFFFULL;

class Value {
    uint64_t bits;

    LZ_INLINE bool is_nan_boxed() const noexcept {
        return (bits & LZ_NAN_MASK) == LZ_NAN_MASK && bits != LZ_NAN_MASK;
    }

public:
    Value() : bits(LZ_TAG_NIL) {}
    explicit Value(double n) : bits(*reinterpret_cast<const uint64_t*>(&n)) {}
    explicit Value(bool b) : bits(b ? LZ_TAG_TRUE : LZ_TAG_FALSE) {}
    explicit Value(Type t, void* ptr) {
        uint64_t tag = LZ_NAN_MASK;
        switch(t) {
            case Type::String:   tag = LZ_TAG_STRING; break;
            case Type::Table:    tag = LZ_TAG_TABLE; break;
            case Type::Function: tag = LZ_TAG_FUNCTION; break;
            case Type::Thread:   tag = LZ_TAG_THREAD; break;
            default: break;
        }
        bits = tag | (reinterpret_cast<uint64_t>(ptr) & LZ_TAG_PTR_MASK);
    }

    LZ_INLINE Type type() const noexcept {
        if (!is_nan_boxed()) return Type::Number;
        switch(bits & ~LZ_TAG_PTR_MASK) {
            case LZ_TAG_NIL:      return Type::Nil;
            case LZ_TAG_FALSE:
            case LZ_TAG_TRUE:     return Type::Bool;
            case LZ_TAG_STRING:   return Type::String;
            case LZ_TAG_TABLE:    return Type::Table;
            case LZ_TAG_FUNCTION: return Type::Function;
            case LZ_TAG_THREAD:   return Type::Thread;
            default:              return Type::UserData;
        }
    }

    LZ_INLINE bool is_nil() const noexcept     { return bits == LZ_TAG_NIL; }
    LZ_INLINE bool is_bool() const noexcept    { return bits == LZ_TAG_FALSE || bits == LZ_TAG_TRUE; }
    LZ_INLINE bool is_number() const noexcept  { return !is_nan_boxed(); }
    LZ_INLINE bool is_string() const noexcept  { return (bits & ~LZ_TAG_PTR_MASK) == LZ_TAG_STRING; }
    LZ_INLINE bool is_table() const noexcept   { return (bits & ~LZ_TAG_PTR_MASK) == LZ_TAG_TABLE; }
    LZ_INLINE bool is_function() const noexcept{ return (bits & ~LZ_TAG_PTR_MASK) == LZ_TAG_FUNCTION; }

    LZ_INLINE double as_number() const noexcept {
        return *reinterpret_cast<const double*>(&bits);
    }

    LZ_INLINE bool as_bool() const noexcept {
        if (is_nil()) return false;
        if (is_bool()) return bits == LZ_TAG_TRUE;
        if (is_number()) return as_number() != 0.0;
        return true; // Everything else is truthy
    }

    LZ_INLINE void* as_ptr() const noexcept {
        return reinterpret_cast<void*>(bits & LZ_TAG_PTR_MASK);
    }

    LZ_INLINE bool operator==(const Value& other) const noexcept {
        if (bits == other.bits) return true;
        if (is_number() && other.is_number())
            return as_number() == other.as_number();
        return false;
    }

    static Value nil() { return Value(); }
    static Value from_bool(bool b) { return Value(b); }
    static Value from_number(double n) { return Value(n); }
};

// ============================================================================
// ARENA ALLOCATOR - Bump pointer allocation, O(1) free-all
// ============================================================================

class Arena {
    struct Block {
        uint8_t* data;
        size_t size;
        size_t used;
        Block* next;
    };

    Block* current;
    Block* blocks;
    size_t block_size;

public:
    explicit Arena(size_t block_sz = 65536) : block_size(block_sz) {
        current = blocks = alloc_block(block_sz);
    }

    ~Arena() {
        while (blocks) {
            Block* next = blocks->next;
            delete[] blocks->data;
            delete blocks;
            blocks = next;
        }
    }

    LZ_INLINE void* alloc(size_t size) {
        size = (size + 7) & ~size_t(7); // 8-byte align
        if (LZ_UNLIKELY(current->used + size > current->size)) {
            grow(size);
        }
        void* ptr = current->data + current->used;
        current->used += size;
        return ptr;
    }

    template<typename T, typename... Args>
    LZ_INLINE T* construct(Args&&... args) {
        void* mem = alloc(sizeof(T));
        return new(mem) T(std::forward<Args>(args)...);
    }

    void reset() {
        for (Block* b = blocks; b; b = b->next) {
            b->used = 0;
        }
        current = blocks;
    }

private:
    Block* alloc_block(size_t sz) {
        Block* b = new Block;
        b->data = new uint8_t[sz];
        b->size = sz;
        b->used = 0;
        b->next = nullptr;
        return b;
    }

    void grow(size_t minimum) {
        size_t new_size = std::max(block_size, minimum);
        Block* b = alloc_block(new_size);
        current->next = b;
        current = b;
    }
};

// ============================================================================
// STRING INTERNING - Immutable strings, hash cached
// ============================================================================

class String {
    struct Data {
        uint32_t hash;
        uint32_t len;
        char chars[1]; // Flexible array member
    };

    Data* data;

public:
    explicit String(Arena& arena, const char* s, size_t len) {
        data = reinterpret_cast<Data*>(arena.alloc(sizeof(Data) + len));
        data->len = static_cast<uint32_t>(len);
        std::memcpy(data->chars, s, len);
        data->chars[len] = '\0';
        // FNV-1a hash
        uint32_t h = 2166136261u;
        for (size_t i = 0; i < len; i++) {
            h ^= static_cast<uint8_t>(s[i]);
            h *= 16777619u;
        }
        data->hash = h;
    }

    LZ_INLINE uint32_t hash() const noexcept { return data->hash; }
    LZ_INLINE uint32_t length() const noexcept { return data->len; }
    LZ_INLINE const char* c_str() const noexcept { return data->chars; }

    bool operator==(const String& other) const noexcept {
        if (data->hash != other.data->hash) return false;
        if (data->len != other.data->len) return false;
        return std::memcmp(data->chars, other.data->chars, data->len) == 0;
    }
};

// ============================================================================
// HASH TABLE - Robin Hood hashing with linear probing
// ============================================================================

template<typename K, typename V>
class Table {
    struct Entry {
        K key;
        V value;
        uint8_t dist; // Distance from ideal position
        bool occupied;
    };

    Entry* entries;
    size_t capacity;
    size_t count;
    Arena& arena;

    static constexpr size_t INITIAL_CAPACITY = 16;
    static constexpr double MAX_LOAD = 0.875;

public:
    explicit Table(Arena& a) : arena(a), capacity(INITIAL_CAPACITY), count(0) {
        entries = reinterpret_cast<Entry*>(arena.alloc(sizeof(Entry) * capacity));
        for (size_t i = 0; i < capacity; i++) {
            entries[i].occupied = false;
            entries[i].dist = 0;
        }
    }

    LZ_INLINE V* get(const K& key) noexcept {
        size_t idx = hash(key) & (capacity - 1);
        uint8_t dist = 0;

        while (entries[idx].occupied) {
            if (entries[idx].dist < dist) return nullptr;
            if (entries[idx].key == key) return &entries[idx].value;
            idx = (idx + 1) & (capacity - 1);
            dist++;
        }
        return nullptr;
    }

    LZ_INLINE void set(const K& key, const V& value) {
        if (LZ_UNLIKELY(count >= capacity * MAX_LOAD)) {
            grow();
        }

        size_t idx = hash(key) & (capacity - 1);
        uint8_t dist = 0;
        Entry insert{key, value, dist, true};

        while (entries[idx].occupied) {
            if (entries[idx].key == key) {
                entries[idx].value = value;
                return;
            }
            if (entries[idx].dist < dist) {
                std::swap(insert, entries[idx]);
                dist = entries[idx].dist;
            }
            idx = (idx + 1) & (capacity - 1);
            dist++;
        }

        entries[idx] = insert;
        count++;
    }

    LZ_INLINE bool remove(const K& key) {
        size_t idx = hash(key) & (capacity - 1);
        uint8_t dist = 0;

        while (entries[idx].occupied) {
            if (entries[idx].dist < dist) return false;
            if (entries[idx].key == key) {
                entries[idx].occupied = false;
                count--;
                // Backward shift deletion
                size_t next = (idx + 1) & (capacity - 1);
                while (entries[next].occupied && entries[next].dist > 0) {
                    entries[idx] = entries[next];
                    entries[idx].dist--;
                    entries[next].occupied = false;
                    idx = next;
                    next = (next + 1) & (capacity - 1);
                }
                return true;
            }
            idx = (idx + 1) & (capacity - 1);
            dist++;
        }
        return false;
    }

private:
    void grow() {
        size_t old_cap = capacity;
        Entry* old_entries = entries;

        capacity *= 2;
        entries = reinterpret_cast<Entry*>(arena.alloc(sizeof(Entry) * capacity));
        for (size_t i = 0; i < capacity; i++) {
            entries[i].occupied = false;
        }
        count = 0;

        for (size_t i = 0; i < old_cap; i++) {
            if (old_entries[i].occupied) {
                set(old_entries[i].key, old_entries[i].value);
            }
        }
    }

    static size_t hash(const Value& v) noexcept {
        return std::hash<uint64_t>{}(v.as_number());
    }

    static size_t hash(const String& s) noexcept {
        return s.hash();
    }
};

// ============================================================================
// VIRTUAL MACHINE
// ============================================================================

enum class OpCode : uint8_t {
    NOP = 0, LOADK, LOADNIL, LOADBOOL, LOADINT,
    MOVE, GETGLOBAL, SETGLOBAL, GETUPVAL, SETUPVAL,
    GETTABLE, SETTABLE, NEWTABLE, SELF,
    ADD, SUB, MUL, DIV, MOD, POW,
    UNM, NOT, LEN, CONCAT,
    JMP, EQ, LT, LE, TEST, TESTSET,
    CALL, TAILCALL, RETURN,
    FORLOOP, FORPREP, TFORLOOP,
    SETLIST, CLOSE, CLOSURE, VARARG,
    // Luazi extensions
    TYPECHECK, ASSERT, ASYNC, AWAIT,
    SIMD_ADD, SIMD_MUL, SIMD_DOT,
    GUARD, DEFER, MATCH,
    NUM_OPCODES
};

struct Instruction {
    uint32_t raw;

    LZ_INLINE OpCode op() const noexcept { return static_cast<OpCode>(raw & 0x3F); }
    LZ_INLINE uint8_t a() const noexcept   { return (raw >> 6) & 0xFF; }
    LZ_INLINE uint16_t b() const noexcept  { return (raw >> 14) & 0x1FF; }
    LZ_INLINE uint16_t c() const noexcept  { return (raw >> 23) & 0x1FF; }
    LZ_INLINE int16_t sbx() const noexcept { return static_cast<int16_t>((raw >> 14) & 0x3FFFF); }
};

class VM {
    // Stack-based execution
    static constexpr size_t STACK_SIZE = 65536;
    static constexpr size_t CONST_POOL = 8192;

    Value stack[STACK_SIZE];
    Value constants[CONST_POOL];
    Instruction* code;
    size_t code_size;

    size_t pc;  // Program counter
    size_t sp;  // Stack pointer
    size_t fp;  // Frame pointer

    Arena arena;
    Table<Value, Value> globals;

public:
    VM() : pc(0), sp(0), fp(0), code(nullptr), code_size(0), globals(arena) {}

    void load(const uint8_t* bytecode, size_t len);
    Value execute();

    // JS/WASM export interface
    extern "C" {
        static VM* create() { return new VM(); }
        static void destroy(VM* vm) { delete vm; }
        static void execute_bytecode(VM* vm, const uint8_t* code, size_t len);
        static void set_global(VM* vm, const char* name, double val);
        static double get_global(VM* vm, const char* name);
        static void collect_garbage(VM* vm);
    }

private:
    LZ_INLINE void dispatch();
    LZ_INLINE Value& reg(uint8_t idx) { return stack[fp + idx]; }
    LZ_INLINE Value& const_val(uint16_t idx) { return constants[idx]; }

    // Opcode handlers
    void op_loadk(const Instruction& i);
    void op_add(const Instruction& i);
    void op_sub(const Instruction& i);
    void op_mul(const Instruction& i);
    void op_div(const Instruction& i);
    void op_jmp(const Instruction& i);
    void op_eq(const Instruction& i);
    void op_lt(const Instruction& i);
    void op_call(const Instruction& i);
    void op_return(const Instruction& i);
};

} // namespace luazi

#endif // LUAZI_VM_H
