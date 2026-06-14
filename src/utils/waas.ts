export function generateOtp(): string {
  return String(Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000);
}

export function maskValue(value: string, prefix: number, suffix: number): string {
  const raw = String(value);
  if (raw.length <= prefix + suffix) return raw;
  const maskedLength = Math.max(0, raw.length - prefix - suffix);
  return `${raw.slice(0, prefix)}${'*'.repeat(maskedLength)}${raw.slice(raw.length - suffix)}`;
}

export function maskMsisdn(value: string): string {
  return maskValue(value, 3, 3);
}

export function maskAccountNumber(value: string): string {
  return maskValue(value, 6, 1);
}
