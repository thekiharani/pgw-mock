export function pyFloat(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}
