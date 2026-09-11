/** Licence keys: RIC-XXXX-XXXX-XXXX-XXXX from an unambiguous alphabet, with a check character at the end. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newLicenseKey(): string {
  const bytes = new Uint8Array(15); crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  const sum = chars.reduce((a, c) => a + ALPHABET.indexOf(c), 0);
  chars.push(ALPHABET[sum % ALPHABET.length]);
  return 'RIC-' + chars.join('').match(/.{4}/g)!.join('-');
}
export function isLicenseKey(k: string): boolean {
  const m = /^RIC-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/.exec(k || '');
  if (!m) return false;
  const chars = (m[1] + m[2] + m[3] + m[4]).split('');
  const check = chars.pop()!;
  const sum = chars.reduce((a, c) => a + ALPHABET.indexOf(c), 0);
  return ALPHABET[sum % ALPHABET.length] === check;
}
