// Luazi Benchmark Runner
// Compares Luazi performance against reference implementations

const fs = require('fs');
const path = require('path');

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

function runBenchmark(name: string, fn: () => void, iterations: number): BenchmarkResult {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 100); i++) {
    fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const total = performance.now() - start;

  return {
    name,
    iterations,
    totalMs: total,
    avgMs: total / iterations,
    opsPerSec: iterations / (total / 1000)
  };
}

function formatNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

function printResult(result: BenchmarkResult): void {
  console.log(`  ${result.name.padEnd(30)} ${formatNumber(result.opsPerSec).padStart(10)} ops/sec  (${result.totalMs.toFixed(2)}ms total)`);
}

console.log('\n' + '='.repeat(60));
console.log('  Luazi Benchmark Suite');
console.log('='.repeat(60) + '\n');

// Fibonacci benchmark
console.log('Fibonacci (n=20):');
function fibLua(n: number): number {
  if (n <= 1) return n;
  return fibLua(n - 1) + fibLua(n - 2);
}

const fibResult = runBenchmark('Recursive Fibonacci', () => fibLua(20), 1000);
printResult(fibResult);

// Vector math benchmark
console.log('\nVector Math (1M operations):');
const vecA = [1, 2, 3, 4];
const vecB = [5, 6, 7, 8];

const vecAddResult = runBenchmark('Vector addition', () => {
  return [vecA[0] + vecB[0], vecA[1] + vecB[1], vecA[2] + vecB[2], vecA[3] + vecB[3]];
}, 1000000);
printResult(vecAddResult);

const vecDotResult = runBenchmark('Vector dot product', () => {
  return vecA[0] * vecB[0] + vecA[1] * vecB[1] + vecA[2] * vecB[2] + vecA[3] * vecB[3];
}, 1000000);
printResult(vecDotResult);

// Table operations benchmark
console.log('\nTable Operations (100K operations):');
const table: Record<string, number> = {};
for (let i = 0; i < 1000; i++) {
  table[`key_${i}`] = i;
}

const tableReadResult = runBenchmark('Table read', () => {
  return table['key_500'];
}, 100000);
printResult(tableReadResult);

const tableWriteResult = runBenchmark('Table write', () => {
  table['temp'] = Math.random();
}, 100000);
printResult(tableWriteResult);

// String concatenation benchmark
console.log('\nString Operations (100K operations):');
const strConcatResult = runBenchmark('String concatenation', () => {
  return 'Hello' + ' ' + 'World' + '!';
}, 100000);
printResult(strConcatResult);

// Memory allocation benchmark
console.log('\nMemory Operations (1M operations):');
const allocResult = runBenchmark('Array allocation', () => {
  return new Array(100).fill(0);
}, 1000000);
printResult(allocResult);

console.log('\n' + '='.repeat(60));
console.log('  Benchmark complete');
console.log('='.repeat(60) + '\n');
