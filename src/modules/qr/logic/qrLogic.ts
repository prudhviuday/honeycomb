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
