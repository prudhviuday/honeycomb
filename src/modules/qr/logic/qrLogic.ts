export function normalizeScanCode(code: string): string {
  return code.trim();
}

export function isValidScanCode(code: string): boolean {
  return normalizeScanCode(code).length > 0;
}

/** Canonical host used by printed QR codes and shared movie links. */
export const PUBLIC_SITE_URL = 'https://honeycomb2.prudhvi123143.workers.dev';

export function buildMovieReferralUrl(campaignId: string, referralCode: string): string {
  const url = new URL('/', PUBLIC_SITE_URL);
  url.searchParams.set('campaign', campaignId);
  url.searchParams.set('ref', referralCode);
  return url.toString();
}

export function buildQrImageUrl(data: string, size = 240): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}
/** Extract the opaque code from a Honeycomb /q/:code URL, or keep a legacy raw code. */
export function extractQrCodeFromScan(value: string): string {
  const input = value.trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^\/q\/([^/]+)\/?$/i);
    if (match) return decodeURIComponent(match[1]).trim();
  } catch {
    // Legacy QR codes may contain a raw code instead of a URL.
  }
  return input;
}

/** Build the public landing URL for a movie promotion QR. */
export function buildPublicQrUrl(code: string): string {
  return new URL('/q/' + encodeURIComponent(code.trim()), PUBLIC_SITE_URL).toString();
}
