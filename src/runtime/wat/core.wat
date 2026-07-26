;; Luazi Core Runtime in WAT
;; Hand-optimized WebAssembly for maximum performance
;; Compile: wat2wasm core.wat -o core.wasm

(module
  ;; Memory: 1 page = 64KB, growable
  (memory (export "memory") 1 8)

  ;; Global state
  (global $stack_ptr (mut i32) (i32.const 1024))    ;; Stack starts at 1KB
  (global $heap_ptr (mut i32) (i32.const 65536))     ;; Heap starts at 64KB
  (global $pc (mut i32) (i32.const 0))               ;; Program counter
  (global $fp (mut i32) (i32.const 1024))            ;; Frame pointer

  ;; Constants
  (global $STACK_SIZE i32 (i32.const 65536))         ;; 64KB stack
  (global $STACK_BASE i32 (i32.const 1024))
  (global $NAN_MASK i64 (i64.const 0x7FF8000000000000))
  (global $TAG_NIL i64 (i64.const 0x7FF8000000000001))
  (global $TAG_TRUE i64 (i64.const 0x7FF8000000000003))
  (global $TAG_FALSE i64 (i64.const 0x7FF8000000000002))

  ;; ==========================================================================
  ;; MEMORY MANAGEMENT
  ;; ==========================================================================

  ;; Bump allocator - O(1) allocation
  (func $alloc (param $size i32) (result i32)
    (local $ptr i32)
    (local.set $ptr (global.get $heap_ptr))
    ;; Align to 8 bytes
    (local.set $size
      (i32.and
        (i32.add (local.get $size) (i32.const 7))
        (i32.const -8)))
    (global.set $heap_ptr
      (i32.add (global.get $heap_ptr) (local.get $size)))
    (local.get $ptr)
  )

  ;; Reset heap (arena reset)
  (func $reset_heap
    (global.set $heap_ptr (i32.const 65536))
  )

  ;; ==========================================================================
  ;; VALUE OPERATIONS (NaN Boxing)
  ;; ==========================================================================

  ;; Create nil value
  (func $val_nil (result i64)
    (global.get $TAG_NIL)
  )

  ;; Create boolean value
  (func $val_bool (param $b i32) (result i64)
    (select
      (global.get $TAG_TRUE)
      (global.get $TAG_FALSE)
      (local.get $b))
  )

  ;; Create number value (just the bits)
  (func $val_number (param $n f64) (result i64)
    (i64.reinterpret_f64 (local.get $n))
  )

  ;; Extract number from value
  (func $as_number (param $v i64) (result f64)
    (f64.reinterpret_i64 (local.get $v))
  )

  ;; Check if value is nil
  (func $is_nil (param $v i64) (result i32)
    (i64.eq (local.get $v) (global.get $TAG_NIL))
  )

  ;; Check if value is a number (not NaN-boxed)
  (func $is_number (param $v i64) (result i32)
    (i32.and
      (i64.eq
        (i64.and (local.get $v) (global.get $NAN_MASK))
        (global.get $NAN_MASK))
      (i32.const 0))  ;; If it matches NaN mask exactly, it's not a number
    ;; Actually: if top bits are not all 1s (0x7FF), it's a number
    (i32.eqz
      (i64.eq
        (i64.and (local.get $v) (i64.const 0x7FF0000000000000))
        (i64.const 0x7FF0000000000000)))
  )

  ;; Check if value is truthy
  (func $is_truthy (param $v i64) (result i32)
    (if (call $is_nil (local.get $v))
      (then (return (i32.const 0))))
    (if (i64.eq (local.get $v) (global.get $TAG_FALSE))
      (then (return (i32.const 0))))
    (if (call $is_number (local.get $v))
      (then
        (return
          (f64.ne
            (call $as_number (local.get $v))
            (f64.const 0)))))
    (i32.const 1)
  )

  ;; ==========================================================================
  ;; STACK OPERATIONS
  ;; ==========================================================================

  ;; Push value onto stack
  (func $push (param $v i64)
    (i64.store
      (global.get $stack_ptr)
      (local.get $v))
    (global.set $stack_ptr
      (i32.add (global.get $stack_ptr) (i32.const 8)))
  )

  ;; Pop value from stack
  (func $pop (result i64)
    (global.set $stack_ptr
      (i32.sub (global.get $stack_ptr) (i32.const 8)))
    (i64.load (global.get $stack_ptr))
  )

  ;; Get value at stack index (relative to frame pointer)
  (func $get_reg (param $idx i32) (result i64)
    (i64.load
      (i32.add
        (global.get $fp)
        (i32.shl (local.get $idx) (i32.const 3))))
  )

  ;; Set value at stack index
  (func $set_reg (param $idx i32) (param $v i64)
    (i64.store
      (i32.add
        (global.get $fp)
        (i32.shl (local.get $idx) (i32.const 3)))
      (local.get $v))
  )

  ;; ==========================================================================
  ;; ARITHMETIC OPERATIONS
  ;; ==========================================================================

  ;; Add two numbers
  (func $add (param $a i64) (param $b i64) (result i64)
    (call $val_number
      (f64.add
        (call $as_number (local.get $a))
        (call $as_number (local.get $b))))
  )

  ;; Subtract
  (func $sub (param $a i64) (param $b i64) (result i64)
    (call $val_number
      (f64.sub
        (call $as_number (local.get $a))
        (call $as_number (local.get $b))))
  )

  ;; Multiply
  (func $mul (param $a i64) (param $b i64) (result i64)
    (call $val_number
      (f64.mul
        (call $as_number (local.get $a))
        (call $as_number (local.get $b))))
  )

  ;; Divide
  (func $div (param $a i64) (param $b i64) (result i64)
    (call $val_number
      (f64.div
        (call $as_number (local.get $a))
        (call $as_number (local.get $b))))
  )

  ;; Negate
  (func $neg (param $a i64) (result i64)
    (call $val_number
      (f64.neg (call $as_number (local.get $a))))
  )

  ;; ==========================================================================
  ;; COMPARISON OPERATIONS
  ;; ==========================================================================

  (func $eq (param $a i64) (param $b i64) (result i32)
    (i64.eq (local.get $a) (local.get $b))
  )

  (func $lt (param $a i64) (param $b i64) (result i32)
    (f64.lt
      (call $as_number (local.get $a))
      (call $as_number (local.get $b)))
  )

  (func $le (param $a i64) (param $b i64) (result i32)
    (f64.le
      (call $as_number (local.get $a))
      (call $as_number (local.get $b)))
  )

  ;; ==========================================================================
  ;; SIMD OPERATIONS (WASM SIMD128)
  ;; ==========================================================================

  ;; SIMD add 4x f64
  (func $simd_add4
    (param $dst i32) (param $a i32) (param $b i32)
    (v128.store
      (local.get $dst)
      (f64x2.add
        (v128.load (local.get $a))
        (v128.load (local.get $b))))
    (v128.store
      (i32.add (local.get $dst) (i32.const 16))
      (f64x2.add
        (v128.load (i32.add (local.get $a) (i32.const 16)))
        (v128.load (i32.add (local.get $b) (i32.const 16)))))
  )

  ;; SIMD multiply 4x f64
  (func $simd_mul4
    (param $dst i32) (param $a i32) (param $b i32)
    (v128.store
      (local.get $dst)
      (f64x2.mul
        (v128.load (local.get $a))
        (v128.load (local.get $b))))
    (v128.store
      (i32.add (local.get $dst) (i32.const 16))
      (f64x2.mul
        (v128.load (i32.add (local.get $a) (i32.const 16)))
        (v128.load (i32.add (local.get $b) (i32.const 16)))))
  )

  ;; SIMD dot product (4x f64)
  (func $simd_dot4 (param $a i32) (param $b i32) (result f64)
    (local $sum f64)
    (local.set $sum
      (f64.add
        (f64x2.extract_lane 0
          (f64x2.mul
            (v128.load (local.get $a))
            (v128.load (local.get $b))))
        (f64x2.extract_lane 1
          (f64x2.mul
            (v128.load (local.get $a))
            (v128.load (local.get $b))))))
    (local.set $sum
      (f64.add
        (local.get $sum)
        (f64.add
          (f64x2.extract_lane 0
            (f64x2.mul
              (v128.load (i32.add (local.get $a) (i32.const 16)))
              (v128.load (i32.add (local.get $b) (i32.const 16)))))
          (f64x2.extract_lane 1
            (f64x2.mul
              (v128.load (i32.add (local.get $a) (i32.const 16)))
              (v128.load (i32.add (local.get $b) (i32.const 16))))))))
    (local.get $sum)
  )

  ;; ==========================================================================
  ;; BYTECODE DISPATCHER
  ;; ==========================================================================

  ;; Execute bytecode from memory
  ;; bytecode format at offset 0:
  ;;   u32 magic (0x4C5A494D)
  ;;   u8  version
  ;;   u8  flags
  ;;   u16 const_count
  ;;   constants[]
  ;;   instructions[]

  (func $execute (param $code_offset i32) (param $code_len i32) (result f64)
    (local $inst i32)
    (local $opcode i32)
    (local $a i32)
    (local $b i32)
    (local $c i32)
    (local $sbx i32)

    ;; Reset state
    (global.set $pc (i32.const 0))
    (global.set $fp (global.get $STACK_BASE))
    (global.set $stack_ptr (global.get $STACK_BASE))

    ;; Skip header (8 bytes)
    (local.set $pc (i32.const 8))

    ;; Main execution loop
    (block $done
      (loop $loop
        ;; Check bounds
        (br_if $done
          (i32.ge_u
            (local.get $pc)
            (local.get $code_len)))

        ;; Fetch instruction (32-bit)
        (local.set $inst
          (i32.load
            (i32.add (local.get $code_offset) (local.get $pc))))
        (global.set $pc
          (i32.add (global.get $pc) (i32.const 4)))

        ;; Decode
        (local.set $opcode (i32.and (local.get $inst) (i32.const 0x3F)))
        (local.set $a
          (i32.and
            (i32.shr_u (local.get $inst) (i32.const 6))
            (i32.const 0xFF)))
        (local.set $b
          (i32.and
            (i32.shr_u (local.get $inst) (i32.const 14))
            (i32.const 0x1FF)))
        (local.set $c
          (i32.and
            (i32.shr_u (local.get $inst) (i32.const 23))
            (i32.const 0x1FF)))
        (local.set $sbx
          (i32.shr_s
            (i32.shl (local.get $inst) (i32.const 12))
            (i32.const 14)))

        ;; Dispatch
        (block $dispatch
          (block $op_return
            (block $op_call
              (block $op_forloop
                (block $op_forprep
                  (block $op_closure
                    (block $op_setlist
                      (block $op_tforloop
                        (block $op_close
                          (block $op_vararg
                            (block $op_settable
                              (block $op_gettable
                                (block $op_newtable
                                  (block $op_self
                                    (block $op_concat
                                      (block $op_len
                                        (block $op_not
                                          (block $op_unm
                                            (block $op_pow
                                              (block $op_mod
                                                (block $op_div
                                                  (block $op_mul
                                                    (block $op_sub
                                                      (block $op_add
                                                        (block $op_testset
                                                          (block $op_test
                                                            (block $op_le
                                                              (block $op_lt
                                                                (block $op_eq
                                                                  (block $op_jmp
                                                                    (block $op_setupval
                                                                      (block $op_getupval
                                                                        (block $op_setglobal
                                                                          (block $op_getglobal
                                                                            (block $op_move
                                                                              (block $op_loadint
                                                                                (block $op_loadbool
                                                                                  (block $op_loadnil
                                                                                    (block $op_loadk
                                                                                      (block $op_nop
                                                                                        ;; NOP = 0
                                                                                        (br $dispatch)
                                                                                      )
                                                                                      ;; LOADK = 1
                                                                                      (call $set_reg
                                                                                        (local.get $a)
                                                                                        (i64.load
                                                                                          (i32.add
                                                                                            (i32.const 2048) ;; const pool offset
                                                                                            (i32.shl (local.get $b) (i32.const 3)))))
                                                                                      (br $dispatch)
                                                                                    )
                                                                                    ;; LOADNIL = 2
                                                                                    (call $set_reg
                                                                                      (local.get $a)
                                                                                      (call $val_nil))
                                                                                    (br $dispatch)
                                                                                  )
                                                                                  ;; LOADBOOL = 3
                                                                                  (call $set_reg
                                                                                    (local.get $a)
                                                                                    (call $val_bool (local.get $b)))
                                                                                  (br $dispatch)
                                                                                )
                                                                                ;; LOADINT = 4
                                                                                (call $set_reg
                                                                                  (local.get $a)
                                                                                  (call $val_number
                                                                                    (f64.convert_i32_s (local.get $sbx))))
                                                                                (br $dispatch)
                                                                              )
                                                                              ;; MOVE = 5
                                                                              (call $set_reg
                                                                                (local.get $a)
                                                                                (call $get_reg (local.get $b)))
                                                                              (br $dispatch)
                                                                            )
                                                                            ;; GETGLOBAL = 6
                                                                            ;; Simplified: load from global table
                                                                            (br $dispatch)
                                                                          )
                                                                          ;; SETGLOBAL = 7
                                                                          (br $dispatch)
                                                                        )
                                                                        ;; GETUPVAL = 8
                                                                        (br $dispatch)
                                                                      )
                                                                      ;; SETUPVAL = 9
                                                                      (br $dispatch)
                                                                    )
                                                                    ;; GETTABLE = 10
                                                                    (br $dispatch)
                                                                  )
                                                                  ;; SETTABLE = 11
                                                                  (br $dispatch)
                                                                )
                                                                ;; NEWTABLE = 12
                                                                (br $dispatch)
                                                              )
                                                              ;; SELF = 13
                                                              (br $dispatch)
                                                            )
                                                            ;; ADD = 14
                                                            (call $set_reg
                                                              (local.get $a)
                                                              (call $add
                                                                (call $get_reg (local.get $b))
                                                                (call $get_reg (local.get $c))))
                                                            (br $dispatch)
                                                          )
                                                          ;; SUB = 15
                                                          (call $set_reg
                                                            (local.get $a)
                                                            (call $sub
                                                              (call $get_reg (local.get $b))
                                                              (call $get_reg (local.get $c))))
                                                          (br $dispatch)
                                                        )
                                                        ;; MUL = 16
                                                        (call $set_reg
                                                          (local.get $a)
                                                          (call $mul
                                                            (call $get_reg (local.get $b))
                                                            (call $get_reg (local.get $c))))
                                                        (br $dispatch)
                                                      )
                                                      ;; DIV = 17
                                                      (call $set_reg
                                                        (local.get $a)
                                                        (call $div
                                                          (call $get_reg (local.get $b))
                                                          (call $get_reg (local.get $c))))
                                                      (br $dispatch)
                                                    )
                                                    ;; MOD = 18
                                                    (br $dispatch)
                                                  )
                                                  ;; POW = 19
                                                  (br $dispatch)
                                                )
                                                ;; UNM = 20
                                                (call $set_reg
                                                  (local.get $a)
                                                  (call $neg (call $get_reg (local.get $b))))
                                                (br $dispatch)
                                              )
                                              ;; NOT = 21
                                              (call $set_reg
                                                (local.get $a)
                                                (call $val_bool
                                                  (i32.eqz (call $is_truthy (call $get_reg (local.get $b))))))
                                              (br $dispatch)
                                            )
                                            ;; LEN = 22
                                            (br $dispatch)
                                          )
                                          ;; CONCAT = 23
                                          (br $dispatch)
                                        )
                                        ;; JMP = 24
                                        (global.set $pc
                                          (i32.add
                                            (global.get $pc)
                                            (i32.shl (local.get $sbx) (i32.const 2))))
                                        (br $dispatch)
                                      )
                                      ;; EQ = 25
                                      (if
                                        (i32.ne
                                          (call $eq
                                            (call $get_reg (local.get $b))
                                            (call $get_reg (local.get $c)))
                                          (local.get $a))
                                        (then
                                          (global.set $pc
                                            (i32.add (global.get $pc) (i32.const 4)))))
                                      (br $dispatch)
                                    )
                                    ;; LT = 26
                                    (if
                                      (i32.ne
                                        (call $lt
                                          (call $get_reg (local.get $b))
                                          (call $get_reg (local.get $c)))
                                        (local.get $a))
                                      (then
                                        (global.set $pc
                                          (i32.add (global.get $pc) (i32.const 4)))))
                                    (br $dispatch)
                                  )
                                  ;; LE = 27
                                  (if
                                    (i32.ne
                                      (call $le
                                        (call $get_reg (local.get $b))
                                        (call $get_reg (local.get $c)))
                                      (local.get $a))
                                    (then
                                      (global.set $pc
                                        (i32.add (global.get $pc) (i32.const 4)))))
                                  (br $dispatch)
                                )
                                ;; TEST = 28
                                (if
                                  (i32.ne
                                    (call $is_truthy (call $get_reg (local.get $a)))
                                    (local.get $c))
                                  (then
                                    (global.set $pc
                                      (i32.add (global.get $pc) (i32.const 4)))))
                                (br $dispatch)
                              )
                              ;; TESTSET = 29
                              (br $dispatch)
                            )
                            ;; CALL = 30
                            (br $dispatch)
                          )
                          ;; TAILCALL = 31
                          (br $dispatch)
                        )
                        ;; RETURN = 32
                        (return
                          (call $as_number (call $get_reg (local.get $a))))
                      )
                      ;; FORLOOP = 33
                      (br $dispatch)
                    )
                    ;; FORPREP = 34
                    (br $dispatch)
                  )
                  ;; TFORLOOP = 35
                  (br $dispatch)
                )
                ;; SETLIST = 36
                (br $dispatch)
              )
              ;; CLOSE = 37
              (br $dispatch)
            )
            ;; CLOSURE = 38
            (br $dispatch)
          )
          ;; VARARG = 39
          (br $dispatch)
        )

        ;; Continue loop
        (br $loop)
      )
    )

    ;; Return top of stack
    (call $as_number
      (call $pop))
  )

  ;; ==========================================================================
  ;; EXPORTS
  ;; ==========================================================================

  (export "alloc" (func $alloc))
  (export "reset_heap" (func $reset_heap))
  (export "execute" (func $execute))
  (export "val_nil" (func $val_nil))
  (export "val_bool" (func $val_bool))
  (export "val_number" (func $val_number))
  (export "is_nil" (func $is_nil))
  (export "is_truthy" (func $is_truthy))
  (export "add" (func $add))
  (export "sub" (func $sub))
  (export "mul" (func $mul))
  (export "div" (func $div))
  (export "simd_add4" (func $simd_add4))
  (export "simd_mul4" (func $simd_mul4))
  (export "simd_dot4" (func $simd_dot4))

  ;; JS interop helpers
  (export "memory" (memory 0))
)
