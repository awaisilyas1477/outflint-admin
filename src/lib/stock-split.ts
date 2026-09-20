/** Split a non-negative total into `count` integer parts that sum exactly to `total`. */
export function splitStockAcrossVariants(total: number, count: number): number[] {
  const n = Math.max(0, Math.floor(total));
  if (count <= 0) return [];
  if (count === 1) return [n];
  const base = Math.floor(n / count);
  const rem = n % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
