export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "");

  if (/^01[3-9]\d{8}$/.test(digits)) {
    return `+88${digits}`;
  }

  if (/^\+8801[3-9]\d{8}$/.test(digits)) {
    return digits;
  }

  if (/^8801[3-9]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}
