function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export const DateUtils = {
  datePrefix(): string {
    const baseYear = 2023;
    const numYears = 26;
    const now = new Date();
    const yearOffset = now.getFullYear() - baseYear;
    const yearIndex = ((yearOffset % numYears) + numYears) % numYears;
    const yearCode = String.fromCharCode(65 + yearIndex);
    const monthCode = String.fromCharCode(65 + now.getMonth());
    const day = now.getDate();
    const dayCode = day <= 9 ? String(day) : String.fromCharCode(65 + (day - 10));
    return `${yearCode}${monthCode}${dayCode}`;
  },

  generateTimestamp(): string {
    const now = new Date();
    return (
      `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}` +
      `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`
    );
  },

  formatB2cDates(): string {
    const now = new Date();
    return (
      `${pad(now.getUTCMonth() + 1, 2)}.${pad(now.getUTCDate(), 2)}.${now.getUTCFullYear()} ` +
      `${pad(now.getUTCHours(), 2)}:${pad(now.getUTCMinutes(), 2)}:${pad(now.getUTCSeconds(), 2)}`
    );
  },
};
