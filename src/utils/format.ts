/**
 * Format a number the way Python's str(float) does, so values embedded inside
 * Daraja callback strings match byte-for-byte (e.g. 27500000.0, not 27500000).
 */
export function pyFloat(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}
