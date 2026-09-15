import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Ricorsa', template: '%s | Ricorsa' },
  description: 'Research the live web with citations you can check, keep what you learn as a data asset you own, and turn it into working apps, agents and datasets that speak MCP.',
  metadataBase: new URL(process.env.APP_BASE_URL || 'https://ricorsa.com'),
  openGraph: { title: 'Ricorsa', description: 'Research it properly. Keep what you learn. Turn it into a tool.', type: 'website', images: ['/brand/og.png'] },
  twitter: { card: 'summary_large_image', title: 'Ricorsa', description: 'Research it properly. Keep what you learn. Turn it into a tool.', images: ['/brand/og.png'] },
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.png', type: 'image/png', sizes: '32x32' }], apple: '/apple-touch-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
