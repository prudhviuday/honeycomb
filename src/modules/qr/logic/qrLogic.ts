export function normalizeScanCode(code: string): string {
  return code.trim();
}

export function isValidScanCode(code: string): boolean {
  return normalizeScanCode(code).length > 0;
}

export function buildMovieReferralUrl(campaignId: string, referralCode: string): string {
  const url = new URL(window.location.origin + '/');
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
    const match = url.pathname.match(/^\\/q\\/([^/]+)\\/?$/i);
    if (match) return decodeURIComponent(match[1]).trim();
  } catch {
    // Legacy QR codes may contain a raw code instead of a URL.
  }
  return input;
}

/** Build the public landing URL for a movie promotion QR. */
export function buildPublicQrUrl(code: string): string {
  return new URL('/q/' + encodeURIComponent(code.trim()), window.location.origin).toString();
}
