export function normalizeScanCode(code: string): string {
  return code.trim();
}

export function isValidScanCode(code: string): boolean {
  return normalizeScanCode(code).length > 0;
}
