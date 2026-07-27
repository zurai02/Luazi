// Luazi C++ Runtime Implementation
// Optimized for WASM compilation with Emscripten
// Zero-cost abstractions, cache-friendly data layouts

#include "vm.h"
#include <cmath>
#include <cstring>

namespace luazi {

// ============================================================================
// VM IMPLEMENTATION
// ============================================================================

void VM::load(const uint8_t* bytecode, size_t len) {
  if (len < 12) {
    throw std::runtime_error("Bytecode too small");
  }

  // Parse header
  uint32_t magic = *reinterpret_cast<const uint32_t*>(bytecode);
  if (magic != 0x4C5A494D) {
    throw std::runtime_error("Invalid bytecode magic");
  }

  uint8_t version = bytecode[4];
  uint8_t flags = bytecode[5];
  uint16_t constCount = *reinterpret_cast<const uint16_t*>(bytecode + 6);
  uint16_t protoCount = *reinterpret_cast<const uint16_t*>(bytecode + 8);
  uint32_t codeSize = *reinterpret_cast<const uint32_t*>(bytecode + 10);

  size_t offset = 12;

  // Load constants
  for (uint16_t i = 0; i < constCount && i < CONST_POOL; i++) {
    uint8_t type = bytecode[offset++];
    switch (type) {
      case 0: // nil
        constants[i] = Value::nil();
        break;
      case 1: { // number
        double val = *reinterpret_cast<const double*>(bytecode + offset);
        offset += 8;
        constants[i] = Value::from_number(val);
        break;
      }
      case 2: // true
        constants[i] = Value::from_bool(true);
        break;
      case 3: { // string
        uint32_t slen = *reinterpret_cast<const uint32_t*>(bytecode + offset);
        offset += 4;
        String* s = arena.construct<String>(arena, reinterpret_cast<const char*>(bytecode + offset), slen);
        offset += slen;
        constants[i] = Value(Type::String, s);
        break;
      }
    }
  }

  // Skip proto table and proto data for now
  for (uint16_t i = 0; i < protoCount; i++) {
    offset += 8;
  }

  // Skip proto data
  for (uint16_t i = 0; i < protoCount; i++) {
    uint32_t pConsts = *reinterpret_cast<const uint32_t*>(bytecode + offset);
    offset += 4;
    uint32_t pInsts = *reinterpret_cast<const uint32_t*>(bytecode + offset);
    offset += 4;
    uint32_t pUpvals = *reinterpret_cast<const uint32_t*>(bytecode + offset);
    offset += 4;
    uint32_t pParams = *reinterpret_cast<const uint32_t*>(bytecode + offset);
    offset += 4;

    for (uint32_t j = 0; j < pConsts; j++) {
      uint8_t type = bytecode[offset++];
      if (type == 1) offset += 8;
      else if (type == 3) {
        uint32_t slen = *reinterpret_cast<const uint32_t*>(bytecode + offset);
        offset += 4 + slen;
      }
    }

    offset += pInsts * 4 + pUpvals * 4;

    for (uint32_t j = 0; j < pUpvals; j++) {
      offset += 4;
      uint8_t nameLen = bytecode[offset++];
      offset += nameLen;
    }
  }

  // Load code
  code_size = codeSize / 4;
  code = arena.construct<Instruction[]>(code_size);
  for (size_t i = 0; i < code_size; i++) {
    code[i].raw = *reinterpret_cast<const uint32_t*>(bytecode + offset + i * 4);
  }

  pc = 0;
  sp = 0;
  fp = 0;
}

Value VM::execute() {
  while (pc < code_size) {
    const Instruction& i = code[pc++];

    switch (i.op()) {
      case OpCode::NOP:
        break;

      case OpCode::LOADK:
        reg(i.a()) = constants[i.b()];
        break;

      case OpCode::LOADNIL:
        reg(i.a()) = Value::nil();
        break;

      case OpCode::LOADBOOL:
        reg(i.a()) = Value::from_bool(i.b() != 0);
        if (i.c() != 0) pc++;
        break;

      case OpCode::LOADINT:
        reg(i.a()) = Value::from_number(static_cast<int16_t>(i.sbx()));
        break;

      case OpCode::MOVE:
        reg(i.a()) = reg(i.b());
        break;

      case OpCode::GETGLOBAL: {
        const String* name = reinterpret_cast<const String*>(constants[i.b()].as_ptr());
        Value* val = globals.get(name);
        reg(i.a()) = val ? *val : Value::nil();
        break;
      }

      case OpCode::SETGLOBAL: {
        const String* name = reinterpret_cast<const String*>(constants[i.b()].as_ptr());
        globals.set(*name, reg(i.a()));
        break;
      }

      case OpCode::GETTABLE: {
        Value tbl = reg(i.b());
        Value key = (i.c() & 0x100) ? constants[i.c() & 0xFF] : reg(i.c());
        if (tbl.is_table()) {
          Table<Value, Value>* t = reinterpret_cast<Table<Value, Value>*>(tbl.as_ptr());
          Value* val = t->get(key);
          reg(i.a()) = val ? *val : Value::nil();
        } else {
          reg(i.a()) = Value::nil();
        }
        break;
      }

      case OpCode::SETTABLE: {
        Value tbl = reg(i.a());
        Value key = (i.b() & 0x100) ? constants[i.b() & 0xFF] : reg(i.b());
        Value val = (i.c() & 0x100) ? constants[i.c() & 0xFF] : reg(i.c());
        if (tbl.is_table()) {
          Table<Value, Value>* t = reinterpret_cast<Table<Value, Value>*>(tbl.as_ptr());
          t->set(key, val);
        }
        break;
      }

      case OpCode::NEWTABLE:
        reg(i.a()) = Value(Type::Table, arena.construct<Table<Value, Value>>(arena));
        break;

      case OpCode::ADD: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        reg(i.a()) = Value::from_number(left + right);
        break;
      }

      case OpCode::SUB: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        reg(i.a()) = Value::from_number(left - right);
        break;
      }

      case OpCode::MUL: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        reg(i.a()) = Value::from_number(left * right);
        break;
      }

      case OpCode::DIV: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        if (right == 0.0) {
          throw std::runtime_error("Division by zero");
        }
        reg(i.a()) = Value::from_number(left / right);
        break;
      }

      case OpCode::MOD: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        reg(i.a()) = Value::from_number(std::fmod(left, right));
        break;
      }

      case OpCode::POW: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        reg(i.a()) = Value::from_number(std::pow(left, right));
        break;
      }

      case OpCode::UNM: {
        double val = reg(i.b()).as_number();
        reg(i.a()) = Value::from_number(-val);
        break;
      }

      case OpCode::NOT: {
        bool val = reg(i.b()).as_bool();
        reg(i.a()) = Value::from_bool(!val);
        break;
      }

      case OpCode::LEN: {
        Value val = reg(i.b());
        if (val.is_string()) {
          const String* s = reinterpret_cast<const String*>(val.as_ptr());
          reg(i.a()) = Value::from_number(static_cast<double>(s->length()));
        } else if (val.is_table()) {
          Table<Value, Value>* t = reinterpret_cast<Table<Value, Value>*>(val.as_ptr());
          reg(i.a()) = Value::from_number(static_cast<double>(t->size()));
        } else {
          reg(i.a()) = Value::from_number(0);
        }
        break;
      }

      case OpCode::CONCAT: {
        // Simplified: just concatenate two values for now
        std::string result = "";
        for (int j = i.b(); j <= i.c(); j++) {
          Value val = reg(j);
          if (val.is_string()) {
            const String* s = reinterpret_cast<const String*>(val.as_ptr());
            result += s->c_str();
          } else if (val.is_number()) {
            result += std::to_string(val.as_number());
          }
        }
        String* s = arena.construct<String>(arena, result.c_str(), result.length());
        reg(i.a()) = Value(Type::String, s);
        break;
      }

      case OpCode::JMP:
        pc += static_cast<int16_t>(i.sbx());
        break;

      case OpCode::EQ: {
        Value left = reg(i.b());
        Value right = reg(i.c());
        bool eq = (left == right);
        if (eq != (i.a() != 0)) pc++;
        break;
      }

      case OpCode::LT: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        if ((left < right) != (i.a() != 0)) pc++;
        break;
      }

      case OpCode::LE: {
        double left = reg(i.b()).as_number();
        double right = reg(i.c()).as_number();
        if ((left <= right) != (i.a() != 0)) pc++;
        break;
      }

      case OpCode::TEST: {
        bool val = reg(i.a()).as_bool();
        if (val != (i.c() != 0)) pc++;
        break;
      }

      case OpCode::TESTSET: {
        Value val = reg(i.b());
        if (val.as_bool() == (i.c() != 0)) {
          reg(i.a()) = val;
        } else {
          pc++;
        }
        break;
      }

      case OpCode::CALL: {
        // Simplified function call - just set result to nil for now
        reg(i.a()) = Value::nil();
        break;
      }

      case OpCode::TAILCALL: {
        reg(i.a()) = Value::nil();
        break;
      }

      case OpCode::RETURN: {
        if (i.b() == 0) {
          return reg(i.a());
        }
        if (i.b() == 1) {
          return Value::nil();
        }
        return reg(i.a());
      }

      case OpCode::CLOSURE: {
        // Create a function value
        reg(i.a()) = Value(Type::Function, nullptr);
        break;
      }

      case OpCode::FORLOOP: {
        double idx = reg(i.a()).as_number() + reg(i.a() + 2).as_number();
        double limit = reg(i.a() + 1).as_number();
        double step = reg(i.a() + 2).as_number();
        reg(i.a()) = Value::from_number(idx);
        if ((step > 0 && idx <= limit) || (step < 0 && idx >= limit)) {
          pc += static_cast<int16_t>(i.sbx());
          reg(i.a() + 3) = Value::from_number(idx);
        }
        break;
      }

      case OpCode::FORPREP: {
        double init = reg(i.a()).as_number();
        double step = reg(i.a() + 2).as_number();
        reg(i.a()) = Value::from_number(init - step);
        pc += static_cast<int16_t>(i.sbx());
        break;
      }

      case OpCode::TYPECHECK: {
        // Simplified type check
        reg(i.a()) = Value::from_bool(true);
        break;
      }

      case OpCode::AWAIT: {
        reg(i.a()) = reg(i.b());
        break;
      }

      default:
        // Unknown opcode - skip
        break;
    }
  }

  return Value::nil();
}

// ============================================================================
// C EXPORT INTERFACE
// ============================================================================

extern "C" {
  luazi::VM* luazi_create_vm() {
    return new luazi::VM();
  }

  void luazi_destroy_vm(luazi::VM* vm) {
    delete vm;
  }

  void luazi_load_bytecode(luazi::VM* vm, const uint8_t* code, size_t len) {
    vm->load(code, len);
  }

  double luazi_execute(luazi::VM* vm) {
    luazi::Value result = vm->execute();
    return result.is_number() ? result.as_number() : (result.as_bool() ? 1.0 : 0.0);
  }

  void luazi_set_global(luazi::VM* vm, const char* name, double val) {
    luazi::String* s = vm->arena.construct<luazi::String>(vm->arena, name, std::strlen(name));
    vm->globals.set(*s, luazi::Value::from_number(val));
  }

  double luazi_get_global(luazi::VM* vm, const char* name) {
    luazi::String s(vm->arena, name, std::strlen(name));
    luazi::Value* val = vm->globals.get(s);
    return val && val->is_number() ? val->as_number() : 0.0;
  }

  void luazi_collect_garbage(luazi::VM* vm) {
    // Arena allocator - reset on full GC
    vm->arena.reset();
  }
}

} // namespace luazi
