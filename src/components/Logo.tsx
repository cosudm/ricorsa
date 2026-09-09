export const SPIRAL = 'M12 4 L13.17 4.18 L14.29 4.52 L15.34 5.01 L16.29 5.63 L17.14 6.38 L17.87 7.23 L18.45 8.16 L18.9 9.15 L19.2 10.19 L19.34 11.24 L19.33 12.28 L19.18 13.31 L18.89 14.28 L18.47 15.2 L17.92 16.03 L17.28 16.77 L16.55 17.4 L15.74 17.91 L14.89 18.29 L14 18.55 L13.09 18.67 L12.2 18.67 L11.32 18.54 L10.49 18.29 L9.71 17.93 L9 17.47 L8.38 16.92 L7.85 16.3 L7.42 15.62 L7.1 14.9 L6.89 14.15 L6.79 13.39 L6.8 12.65 L6.91 11.92 L7.12 11.23 L7.43 10.59 L7.81 10.01 L8.27 9.5 L8.78 9.08 L9.34 8.74 L9.93 8.48 L10.53 8.32 L11.14 8.25 L11.74 8.27 L12.32 8.37 L12.86 8.55 L13.36 8.8 L13.81 9.11 L14.2 9.47 L14.52 9.88 L14.77 10.32 L14.95 10.78 L15.06 11.24 L15.1 11.71 L15.07 12.16 L14.98 12.59 L14.83 12.99 L14.62 13.34 L14.38 13.66 L14.1 13.93';

export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={SPIRAL} stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12.4" r="1.7" fill="#E9A57A" />
    </svg>
  );
}

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <a className="brand" href="/" aria-label="Ricorsa home">
      <span className="logomark" style={{ width: size, height: size, borderRadius: size * 0.29 }}><Mark size={Math.round(size * 0.64)} /></span>
      <span className="wordmark" style={{ fontSize: size * 0.86 }}>ricorsa</span>
    </a>
  );
}
