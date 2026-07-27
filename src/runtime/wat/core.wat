(module
  ;; Memory: 1 page (64KB) initial, 8 pages max
  (memory (export "memory") 1 8)
  
  ;; Globals
  (global $stack_ptr (mut i32) (i32.const 0))
  (global $frame_ptr (mut i32) (i32.const 0))
  (global $pc (mut i32) (i32.const 0))
  (global $free_ptr (mut i32) (i32.const 1024))
  (global $const_pool (mut i32) (i32.const 2048))
  
  ;; Type tags for NaN boxing
  (global $TAG_NIL i64 (i64.const 0x7FF8000000000000))
  (global $TAG_TRUE i64 (i64.const 0x7FF8000000000001))
  (global $TAG_FALSE i64 (i64.const 0x7FF8000000000002))
  (global $TAG_STRING i64 (i64.const 0x7FF8000000000003))
  (global $TAG_TABLE i64 (i64.const 0x7FF8000000000004))
  (global $TAG_FUNCTION i64 (i64.const 0x7FF8000000000005))
  
  ;; ============================================================================
  ;; IMPORTS
  ;; ============================================================================
  (import "env" "print" (func $print (param i32 i32)))
  (import "env" "now" (func $now (result f64)))
  (import "env" "sin" (func $sin (param f64) (result f64)))
  (import "env" "cos" (func $cos (param f64) (result f64)))
  (import "env" "sqrt" (func $sqrt (param f64) (result f64)))
  (import "env" "pow" (func $pow (param f64 f64) (result f64)))
  
  ;; ============================================================================
  ;; HELPER FUNCTIONS
  ;; ============================================================================
  
  ;; Allocate memory from bump allocator
  (func $alloc (param $size i32) (result i32)
    (local $ptr i32)
    (local.set $ptr (global.get $free_ptr))
    (global.set $free_ptr (i32.add (local.get $ptr) (local.get $size)))
    (local.get $ptr)
  )
  
  ;; Get register value (8-byte aligned)
  (func $get_reg (param $idx i32) (result i64)
    (i64.load
      (i32.add
        (global.get $frame_ptr)
        (i32.shl (local.get $idx) (i32.const 3))
      )
    )
  )
  
  ;; Set register value
  (func $set_reg (param $idx i32) (param $val i64)
    (i64.store
      (i32.add
        (global.get $frame_ptr)
        (i32.shl (local.get $idx) (i32.const 3))
      )
      (local.get $val)
    )
  )
  
  ;; Get constant from pool
  (func $get_const (param $idx i32) (result i64)
    (i64.load
      (i32.add
        (global.get $const_pool)
        (i32.shl (local.get $idx) (i32.const 3))
      )
    )
  )
  
  ;; Check if value is a number (not NaN-boxed)
  (func $is_number (param $val i64) (result i32)
    (i64.lt_u
      (i64.shr_u (local.get $val) (i64.const 52))
      (i64.const 0x7FF)
    )
  )
  
  ;; Check if value is nil
  (func $is_nil (param $val i64) (result i32)
    (i64.eq (local.get $val) (global.get $TAG_NIL))
  )
  
  ;; Check if value is truthy
  (func $is_truthy (param $val i64) (result i32)
    (if (call $is_nil (local.get $val))
      (then (return (i32.const 0)))
    )
    (if (i64.eq (local.get $val) (global.get $TAG_FALSE))
      (then (return (i32.const 0)))
    )
    (if (call $is_number (local.get $val))
      (then
        (return
          (f64.ne
            (f64.reinterpret_i64 (local.get $val))
            (f64.const 0)
          )
        )
      )
    )
    (i32.const 1)
  )
  
  ;; Convert value to number
  (func $to_number (param $val i64) (result f64)
    (if (call $is_number (local.get $val))
      (then (return (f64.reinterpret_i64 (local.get $val))))
    )
    (f64.const 0)
  )
  
  ;; Convert value to boolean
  (func $to_bool (param $val i64) (result i32)
    (call $is_truthy (local.get $val))
  )
  
  ;; Create number value
  (func $make_num (param $val f64) (result i64)
    (i64.reinterpret_f64 (local.get $val))
  )
  
  ;; Create nil value
  (func $make_nil (result i64)
    (global.get $TAG_NIL)
  )
  
  ;; Create boolean value
  (func $make_bool (param $val i32) (result i64)
    (if (local.get $val)
      (then (return (global.get $TAG_TRUE)))
    )
    (global.get $TAG_FALSE)
  )
  
  ;; ============================================================================
  ;; TABLE OPERATIONS
  ;; ============================================================================
  
  ;; Create new table
  (func $new_table (result i64)
    (local $ptr i32)
    (local.set $ptr (call $alloc (i32.const 16)))
    (i32.store (local.get $ptr) (i32.const 0))
    (i32.store (i32.add (local.get $ptr) (i32.const 4)) (i32.const 8))
    (i32.store (i32.add (local.get $ptr) (i32.const 8)) (i32.const 0))
    (i32.store (i32.add (local.get $ptr) (i32.const 12)) (i32.const 0))
    (i64.or
      (global.get $TAG_TABLE)
      (i64.extend_i32_u (local.get $ptr))
    )
  )
  
  ;; Get table entry
  (func $table_get (param $tbl i64) (param $key i64) (result i64)
    (local $ptr i32)
    (local $count i32)
    (local $data i32)
    (local $i i32)
    (local.set $ptr (i32.wrap_i64 (i64.and (local.get $tbl) (i64.const 0xFFFFFFFF))))
    (local.set $count (i32.load (local.get $ptr)))
    (local.set $data (i32.load (i32.add (local.get $ptr) (i32.const 8))))
    (if (i32.eqz (local.get $data))
      (then (return (call $make_nil)))
    )
    (local.set $i (i32.const 0))
    (block $done
      (loop $search
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $search)
      )
    )
    (call $make_nil)
  )
  
  ;; Set table entry
  (func $table_set (param $tbl i64) (param $key i64) (param $val i64)
  )
  
  ;; ============================================================================
  ;; STRING OPERATIONS
  ;; ============================================================================
  
  ;; Create string from memory
  (func $make_string (param $ptr i32) (param $len i32) (result i64)
    (local $str_ptr i32)
    (local.set $str_ptr (call $alloc (i32.add (local.get $len) (i32.const 8))))
    (i32.store (local.get $str_ptr) (local.get $len))
    (memory.copy
      (i32.add (local.get $str_ptr) (i32.const 4))
      (local.get $ptr)
      (local.get $len)
    )
    (i64.or
      (global.get $TAG_STRING)
      (i64.extend_i32_u (local.get $str_ptr))
    )
  )
  
  ;; Get string length
  (func $string_len (param $str i64) (result i32)
    (local $ptr i32)
    (local.set $ptr (i32.wrap_i64 (i64.and (local.get $str) (i64.const 0xFFFFFFFF))))
    (i32.load (local.get $ptr))
  )
  
  ;; Concatenate two strings
  (func $string_concat (param $a i64) (param $b i64) (result i64)
    (local $a_ptr i32)
    (local $b_ptr i32)
    (local $a_len i32)
    (local $b_len i32)
    (local $result i32)
    (local.set $a_ptr (i32.wrap_i64 (i64.and (local.get $a) (i64.const 0xFFFFFFFF))))
    (local.set $b_ptr (i32.wrap_i64 (i64.and (local.get $b) (i64.const 0xFFFFFFFF))))
    (local.set $a_len (i32.load (local.get $a_ptr)))
    (local.set $b_len (i32.load (local.get $b_ptr)))
    (local.set $result (call $alloc (i32.add (i32.add (local.get $a_len) (local.get $b_len)) (i32.const 8))))
    (i32.store (local.get $result) (i32.add (local.get $a_len) (local.get $b_len)))
    (memory.copy
      (i32.add (local.get $result) (i32.const 4))
      (i32.add (local.get $a_ptr) (i32.const 4))
      (local.get $a_len)
    )
    (memory.copy
      (i32.add (i32.add (local.get $result) (i32.const 4)) (local.get $a_len))
      (i32.add (local.get $b_ptr) (i32.const 4))
      (local.get $b_len)
    )
    (i64.or
      (global.get $TAG_STRING)
      (i64.extend_i32_u (local.get $result))
    )
  )
  
  ;; ============================================================================
  ;; MAIN DISPATCH LOOP
  ;; ============================================================================
  
  (func $execute (param $bytecode_ptr i32) (param $bytecode_len i32) (result f64)
    (local $opcode i32)
    (local $a i32)
    (local $b i32)
    (local $c i32)
    (local $sbx i32)
    (local $inst i32)
    (local $left i64)
    (local $right i64)
    (local $result i64)
    (local $tbl i64)
    (local $key i64)
    (local $val i64)
    (local $tmp f64)
    
    (global.set $pc (local.get $bytecode_ptr))
    (global.set $frame_ptr (i32.const 0))
    (global.set $stack_ptr (i32.const 0))
    
    (block $done
      (loop $dispatch
        (br_if $done (i32.ge_u (global.get $pc) (i32.add (local.get $bytecode_ptr) (local.get $bytecode_len))))
        
        (local.set $inst (i32.load (global.get $pc)))
        (global.set $pc (i32.add (global.get $pc) (i32.const 4)))
        
        (local.set $opcode (i32.and (local.get $inst) (i32.const 0x3F)))
        (local.set $a (i32.and (i32.shr_u (local.get $inst) (i32.const 6)) (i32.const 0xFF)))
        (local.set $b (i32.and (i32.shr_u (local.get $inst) (i32.const 14)) (i32.const 0x1FF)))
        (local.set $c (i32.and (i32.shr_u (local.get $inst) (i32.const 23)) (i32.const 0x1FF)))
        (local.set $sbx (i32.shr_s (i32.shl (local.get $inst) (i32.const 8)) (i32.const 8)))
        
        (block $dispatch_end
          
          ;; NOP (0)
          (if (i32.eq (local.get $opcode) (i32.const 0))
            (then (br $dispatch_end))
          )
          
          ;; LOADK (1) - A Bx
          (if (i32.eq (local.get $opcode) (i32.const 1))
            (then
              (call $set_reg (local.get $a) (call $get_const (local.get $b)))
              (br $dispatch_end)
            )
          )
          
          ;; LOADNIL (2) - A
          (if (i32.eq (local.get $opcode) (i32.const 2))
            (then
              (call $set_reg (local.get $a) (call $make_nil))
              (br $dispatch_end)
            )
          )
          
          ;; LOADBOOL (3) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 3))
            (then
              (call $set_reg (local.get $a) (call $make_bool (i32.ne (local.get $b) (i32.const 0))))
              (if (local.get $c)
                (then (global.set $pc (i32.add (global.get $pc) (i32.const 4))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; LOADINT (4) - A sBx
          (if (i32.eq (local.get $opcode) (i32.const 4))
            (then
              (call $set_reg (local.get $a) (call $make_num (f64.convert_i32_s (local.get $sbx))))
              (br $dispatch_end)
            )
          )
          
          ;; MOVE (5) - A B
          (if (i32.eq (local.get $opcode) (i32.const 5))
            (then
              (call $set_reg (local.get $a) (call $get_reg (local.get $b)))
              (br $dispatch_end)
            )
          )
          
          ;; GETGLOBAL (6) - A Bx
          (if (i32.eq (local.get $opcode) (i32.const 6))
            (then
              (call $set_reg (local.get $a) (call $get_const (local.get $b)))
              (br $dispatch_end)
            )
          )
          
          ;; SETGLOBAL (7) - A Bx
          (if (i32.eq (local.get $opcode) (i32.const 7))
            (then (br $dispatch_end))
          )
          
          ;; GETUPVAL (8) - A B
          (if (i32.eq (local.get $opcode) (i32.const 8))
            (then
              (call $set_reg (local.get $a) (call $make_nil))
              (br $dispatch_end)
            )
          )
          
          ;; SETUPVAL (9) - A B
          (if (i32.eq (local.get $opcode) (i32.const 9))
            (then (br $dispatch_end))
          )
          
          ;; GETTABLE (10) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 10))
            (then
              (local.set $tbl (call $get_reg (local.get $b)))
              (local.set $key
                (if (result i64) (i32.ge_u (local.get $c) (i32.const 256))
                  (then (call $get_const (i32.sub (local.get $c) (i32.const 256))))
                  (else (call $get_reg (local.get $c)))
                )
              )
              (if (i64.ge_u (local.get $tbl) (global.get $TAG_TABLE))
                (then
                  (call $set_reg (local.get $a) (call $table_get (local.get $tbl) (local.get $key)))
                )
                (else
                  (call $set_reg (local.get $a) (call $make_nil))
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; SETTABLE (11) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 11))
            (then
              (local.set $tbl (call $get_reg (local.get $a)))
              (local.set $key
                (if (result i64) (i32.ge_u (local.get $b) (i32.const 256))
                  (then (call $get_const (i32.sub (local.get $b) (i32.const 256))))
                  (else (call $get_reg (local.get $b)))
                )
              )
              (local.set $val
                (if (result i64) (i32.ge_u (local.get $c) (i32.const 256))
                  (then (call $get_const (i32.sub (local.get $c) (i32.const 256))))
                  (else (call $get_reg (local.get $c)))
                )
              )
              (call $table_set (local.get $tbl) (local.get $key) (local.get $val))
              (br $dispatch_end)
            )
          )
          
          ;; NEWTABLE (12) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 12))
            (then
              (call $set_reg (local.get $a) (call $new_table))
              (br $dispatch_end)
            )
          )
          
          ;; SELF (13) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 13))
            (then
              (local.set $tbl (call $get_reg (local.get $b)))
              (call $set_reg (i32.add (local.get $a) (i32.const 1)) (local.get $tbl))
              (local.set $key
                (if (result i64) (i32.ge_u (local.get $c) (i32.const 256))
                  (then (call $get_const (i32.sub (local.get $c) (i32.const 256))))
                  (else (call $get_reg (local.get $c)))
                )
              )
              (call $set_reg (local.get $a) (call $table_get (local.get $tbl) (local.get $key)))
              (br $dispatch_end)
            )
          )
          
          ;; ADD (14) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 14))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num
                  (f64.add
                    (call $to_number (call $get_reg (local.get $b)))
                    (call $to_number (call $get_reg (local.get $c)))
                  )
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; SUB (15) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 15))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num
                  (f64.sub
                    (call $to_number (call $get_reg (local.get $b)))
                    (call $to_number (call $get_reg (local.get $c)))
                  )
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; MUL (16) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 16))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num
                  (f64.mul
                    (call $to_number (call $get_reg (local.get $b)))
                    (call $to_number (call $get_reg (local.get $c)))
                  )
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; DIV (17) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 17))
            (then
              (local.set $tmp (call $to_number (call $get_reg (local.get $c))))
              (if (f64.eq (local.get $tmp) (f64.const 0))
                (then
                  (call $set_reg (local.get $a) (call $make_num (f64.const 0x7FF0000000000000)))
                )
                (else
                  (call $set_reg
                    (local.get $a)
                    (call $make_num
                      (f64.div
                        (call $to_number (call $get_reg (local.get $b)))
                        (local.get $tmp)
                      )
                    )
                  )
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; MOD (18) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 18))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num
                  (f64.rem
                    (call $to_number (call $get_reg (local.get $b)))
                    (call $to_number (call $get_reg (local.get $c)))
                  )
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; POW (19) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 19))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num
                  (call $pow
                    (call $to_number (call $get_reg (local.get $b)))
                    (call $to_number (call $get_reg (local.get $c)))
                  )
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; UNM (20) - A B
          (if (i32.eq (local.get $opcode) (i32.const 20))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num (f64.neg (call $to_number (call $get_reg (local.get $b)))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; NOT (21) - A B
          (if (i32.eq (local.get $opcode) (i32.const 21))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_bool (i32.eqz (call $is_truthy (call $get_reg (local.get $b)))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; LEN (22) - A B
          (if (i32.eq (local.get $opcode) (i32.const 22))
            (then
              (local.set $val (call $get_reg (local.get $b)))
              (if (call $is_number (local.get $val))
                (then
                  (call $set_reg (local.get $a) (call $make_num (f64.abs (call $to_number (local.get $val)))))
                )
                (else
                  (call $set_reg (local.get $a) (call $make_num (f64.const 0)))
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; CONCAT (23) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 23))
            (then
              (call $set_reg
                (local.get $a)
                (call $string_concat (call $get_reg (local.get $b)) (call $get_reg (local.get $c)))
              )
              (br $dispatch_end)
            )
          )
          
          ;; JMP (24) - sBx
          (if (i32.eq (local.get $opcode) (i32.const 24))
            (then
              (global.set $pc (i32.add (global.get $pc) (i32.mul (local.get $sbx) (i32.const 4))))
              (br $dispatch_end)
            )
          )
          
          ;; EQ (25) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 25))
            (then
              (local.set $left (call $get_reg (local.get $b)))
              (local.set $right (call $get_reg (local.get $c)))
              (local.set $result
                (if (result i64) (i64.eq (local.get $left) (local.get $right))
                  (then (i64.const 1))
                  (else (i64.const 0))
                )
              )
              (if (i32.ne (i32.wrap_i64 (local.get $result)) (local.get $a))
                (then (global.set $pc (i32.add (global.get $pc) (i32.const 4))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; LT (26) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 26))
            (then
              (local.set $tmp
                (f64.lt
                  (call $to_number (call $get_reg (local.get $b)))
                  (call $to_number (call $get_reg (local.get $c)))
                )
              )
              (if (i32.ne (i32.wrap_i64 (call $make_bool (i32.wrap_i64 (local.get $tmp)))) (local.get $a))
                (then (global.set $pc (i32.add (global.get $pc) (i32.const 4))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; LE (27) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 27))
            (then
              (local.set $tmp
                (f64.le
                  (call $to_number (call $get_reg (local.get $b)))
                  (call $to_number (call $get_reg (local.get $c)))
                )
              )
              (if (i32.ne (i32.wrap_i64 (call $make_bool (i32.wrap_i64 (local.get $tmp)))) (local.get $a))
                (then (global.set $pc (i32.add (global.get $pc) (i32.const 4))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; TEST (28) - A C
          (if (i32.eq (local.get $opcode) (i32.const 28))
            (then
              (if (i32.ne (call $is_truthy (call $get_reg (local.get $a))) (local.get $c))
                (then (global.set $pc (i32.add (global.get $pc) (i32.const 4))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; TESTSET (29) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 29))
            (then
              (local.set $val (call $get_reg (local.get $b)))
              (if (i32.eq (call $is_truthy (local.get $val)) (local.get $c))
                (then (call $set_reg (local.get $a) (local.get $val)))
                (else (global.set $pc (i32.add (global.get $pc) (i32.const 4))))
              )
              (br $dispatch_end)
            )
          )
          
          ;; CALL (30) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 30))
            (then
              (call $set_reg (local.get $a) (call $make_nil))
              (br $dispatch_end)
            )
          )
          
          ;; TAILCALL (31) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 31))
            (then
              (call $set_reg (local.get $a) (call $make_nil))
              (br $dispatch_end)
            )
          )
          
          ;; RETURN (32) - A B
          (if (i32.eq (local.get $opcode) (i32.const 32))
            (then
              (return (call $to_number (call $get_reg (local.get $a))))
            )
          )
          
          ;; FORLOOP (33) - A sBx
          (if (i32.eq (local.get $opcode) (i32.const 33))
            (then
              (local.set $tmp
                (f64.add
                  (call $to_number (call $get_reg (local.get $a)))
                  (call $to_number (call $get_reg (i32.add (local.get $a) (i32.const 2))))
                )
              )
              (call $set_reg (local.get $a) (call $make_num (local.get $tmp)))
              (local.set $left (call $to_number (call $get_reg (i32.add (local.get $a) (i32.const 1)))))
              (local.set $right (call $to_number (call $get_reg (i32.add (local.get $a) (i32.const 2)))))
              (if (i32.or
                (i32.and (f64.gt (local.get $right) (f64.const 0)) (f64.le (local.get $tmp) (local.get $left)))
                (i32.and (f64.lt (local.get $right) (f64.const 0)) (f64.ge (local.get $tmp) (local.get $left)))
              )
                (then
                  (global.set $pc (i32.add (global.get $pc) (i32.mul (local.get $sbx) (i32.const 4))))
                  (call $set_reg (i32.add (local.get $a) (i32.const 3)) (call $make_num (local.get $tmp)))
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; FORPREP (34) - A sBx
          (if (i32.eq (local.get $opcode) (i32.const 34))
            (then
              (call $set_reg
                (local.get $a)
                (call $make_num
                  (f64.sub
                    (call $to_number (call $get_reg (local.get $a)))
                    (call $to_number (call $get_reg (i32.add (local.get $a) (i32.const 2))))
                  )
                )
              )
              (global.set $pc (i32.add (global.get $pc) (i32.mul (local.get $sbx) (i32.const 4))))
              (br $dispatch_end)
            )
          )
          
          ;; TFORLOOP (35) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 35))
            (then (br $dispatch_end))
          )
          
          ;; SETLIST (36) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 36))
            (then
              (local.set $tbl (call $get_reg (local.get $a)))
              (local.set $i (i32.const 1))
              (block $setlist_done
                (loop $setlist_loop
                  (br_if $setlist_done (i32.gt_u (local.get $i) (local.get $b)))
                  (call $table_set
                    (local.get $tbl)
                    (call $make_num (f64.convert_i32_u (local.get $i)))
                    (call $get_reg (i32.add (local.get $a) (local.get $i)))
                  )
                  (local.set $i (i32.add (local.get $i) (i32.const 1)))
                  (br $setlist_loop)
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; CLOSE (37) - A
          (if (i32.eq (local.get $opcode) (i32.const 37))
            (then (br $dispatch_end))
          )
          
          ;; CLOSURE (38) - A Bx
          (if (i32.eq (local.get $opcode) (i32.const 38))
            (then
              (call $set_reg
                (local.get $a)
                (i64.or (global.get $TAG_FUNCTION) (i64.extend_i32_u (local.get $b)))
              )
              (br $dispatch_end)
            )
          )
          
          ;; VARARG (39) - A B
          (if (i32.eq (local.get $opcode) (i32.const 39))
            (then (br $dispatch_end))
          )
          
          ;; TYPECHECK (40) - A B
          (if (i32.eq (local.get $opcode) (i32.const 40))
            (then
              (call $set_reg (local.get $a) (call $make_bool (i32.const 1)))
              (br $dispatch_end)
            )
          )
          
          ;; ASSERT (41) - A Bx
          (if (i32.eq (local.get $opcode) (i32.const 41))
            (then
              (if (i32.eqz (call $is_truthy (call $get_reg (local.get $a))))
                (then (unreachable))
              )
              (br $dispatch_end)
            )
          )
          
          ;; ASYNC (42) - A
          (if (i32.eq (local.get $opcode) (i32.const 42))
            (then (br $dispatch_end))
          )
          
          ;; AWAIT (43) - A B
          (if (i32.eq (local.get $opcode) (i32.const 43))
            (then
              (call $set_reg (local.get $a) (call $get_reg (local.get $b)))
              (br $dispatch_end)
            )
          )
          
          ;; SIMD_ADD (44) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 44))
            (then
              (local.set $i (i32.const 0))
              (block $simd_done
                (loop $simd_loop
                  (br_if $simd_done (i32.ge_u (local.get $i) (i32.const 4)))
                  (call $set_reg
                    (i32.add (local.get $a) (local.get $i))
                    (call $make_num
                      (f64.add
                        (call $to_number (call $get_reg (i32.add (local.get $b) (local.get $i))))
                        (call $to_number (call $get_reg (i32.add (local.get $c) (local.get $i))))
                      )
                    )
                  )
                  (local.set $i (i32.add (local.get $i) (i32.const 1)))
                  (br $simd_loop)
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; SIMD_MUL (45) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 45))
            (then
              (local.set $i (i32.const 0))
              (block $simd_mul_done
                (loop $simd_mul_loop
                  (br_if $simd_mul_done (i32.ge_u (local.get $i) (i32.const 4)))
                  (call $set_reg
                    (i32.add (local.get $a) (local.get $i))
                    (call $make_num
                      (f64.mul
                        (call $to_number (call $get_reg (i32.add (local.get $b) (local.get $i))))
                        (call $to_number (call $get_reg (i32.add (local.get $c) (local.get $i))))
                      )
                    )
                  )
                  (local.set $i (i32.add (local.get $i) (i32.const 1)))
                  (br $simd_mul_loop)
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; SIMD_DOT (46) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 46))
            (then
              (local.set $tmp (f64.const 0))
              (local.set $i (i32.const 0))
              (block $simd_dot_done
                (loop $simd_dot_loop
                  (br_if $simd_dot_done (i32.ge_u (local.get $i) (i32.const 4)))
                  (local.set $tmp
                    (f64.add
                      (local.get $tmp)
                      (f64.mul
                        (call $to_number (call $get_reg (i32.add (local.get $b) (local.get $i))))
                        (call $to_number (call $get_reg (i32.add (local.get $c) (local.get $i))))
                      )
                    )
                  )
                  (local.set $i (i32.add (local.get $i) (i32.const 1)))
                  (br $simd_dot_loop)
                )
              )
              (call $set_reg (local.get $a) (call $make_num (local.get $tmp)))
              (br $dispatch_end)
            )
          )
          
          ;; GUARD (47) - A sBx
          (if (i32.eq (local.get $opcode) (i32.const 47))
            (then
              (if (i32.eqz (call $is_truthy (call $get_reg (local.get $a))))
                (then
                  (global.set $pc (i32.add (global.get $pc) (i32.mul (local.get $sbx) (i32.const 4))))
                )
              )
              (br $dispatch_end)
            )
          )
          
          ;; DEFER (48) - A
          (if (i32.eq (local.get $opcode) (i32.const 48))
            (then (br $dispatch_end))
          )
          
          ;; MATCH (49) - A B C
          (if (i32.eq (local.get $opcode) (i32.const 49))
            (then (br $dispatch_end))
          )
          
        ) ;; end dispatch block
        
        (br $dispatch)
      )
    )
    
    (call $to_number (call $get_reg (i32.const 0)))
  )
  
  ;; ============================================================================
  ;; EXPORTS
  ;; ============================================================================
  
  (export "execute" (func $execute))
  (export "alloc" (func $alloc))
  (export "get_reg" (func $get_reg))
  (export "set_reg" (func $set_reg))
  (export "new_table" (func $new_table))
  (export "table_get" (func $table_get))
  (export "table_set" (func $table_set))
  (export "make_string" (func $make_string))
  (export "string_concat" (func $string_concat))
  (export "make_num" (func $make_num))
  (export "make_nil" (func $make_nil))
  (export "make_bool" (func $make_bool))
)
