import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Ricorsa', template: '%s | Ricorsa' },
  description: 'An answer engine that learns you. Live web citations, and an identity graph that makes every question sharper than the last.',
  metadataBase: new URL(process.env.APP_BASE_URL || 'https://ricorsa.com'),
  openGraph: { title: 'Ricorsa', description: 'An answer engine that learns you.', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
