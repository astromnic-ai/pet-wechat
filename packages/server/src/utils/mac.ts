export const NORMALIZED_MAC_REGEX = /^[0-9A-F]{12}$/;

export function normalizeMac(mac: string): string {
  return mac.replace(/[:\-\s]/g, "").toUpperCase();
}
