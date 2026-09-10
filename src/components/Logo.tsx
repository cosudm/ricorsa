/**
 * The Ricorsa brand: a blue square with the spiral, and the wordmark. Both are vector (traced from the
 * master logo), so they stay crisp at any size. The files under /public/brand are the same art for
 * places that need a URL (share images, the sign-in page, app icons).
 */
export const SPIRAL = 'M4355 4776 c-49 -22 -77 -60 -83 -112 -11 -103 55 -154 199 -154 224 0 468 -98 636 -254 216 -200 319 -497 269 -776 -29 -160 -104 -306 -220 -427 -160 -169 -339 -248 -561 -247 -202 1 -340 57 -475 193 -129 130 -180 251 -180 427 0 160 54 288 168 396 182 174 459 185 615 24 113 -115 128 -291 36 -407 -58 -73 -176 -103 -233 -58 -34 27 -33 59 4 111 36 49 39 98 10 146 -50 81 -165 76 -247 -10 -84 -87 -102 -225 -44 -342 124 -251 471 -277 696 -51 277 277 186 742 -180 928 -281 142 -628 81 -866 -153 -415 -409 -294 -1098 242 -1375 163 -84 376 -126 541 -105 377 47 679 251 861 580 141 258 167 598 66 886 -151 434 -538 731 -1017 783 -133 14 -200 13 -237 -3z';

/** The square mark with the spiral. */
export function Mark({ size = 28 }: { size?: number }) {
  const id = 'rg' + size;
  return (
    <svg width={size} height={size} viewBox="247 149.5 423 423" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0B6BB0" /><stop offset=".55" stopColor="#075AA0" /><stop offset="1" stopColor="#063C7E" /></linearGradient>
        <linearGradient id={id + 's'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#CFE3F8" /></linearGradient>
      </defs>
      <rect x="247" y="149.5" width="423" height="423" rx="100" fill={`url(#${id})`} />
      <g transform="translate(0,724) scale(0.1,-0.1)"><path d={SPIRAL} fill={`url(#${id}s)`} /></g>
    </svg>
  );
}

/** Mark and wordmark side by side, linking home. `size` is the mark's height; the wordmark scales with it. */
export function Brand({ size = 30 }: { size?: number }) {
  return (
    <a className="brand" href="/" aria-label="Ricorsa home">
      <span className="logomark" style={{ width: size, height: size }}><Mark size={size} /></span>
      <img className="wordmark" src="/brand/wordmark.svg" alt="ricorsa" style={{ height: Math.round(size * 0.72) }} width={Math.round(size * 0.72 * 3.95)} height={Math.round(size * 0.72)} />
    </a>
  );
}
