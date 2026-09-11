import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Under `next dev`, expose the Worker bindings from wrangler.jsonc (the D1 database) through getCloudflareContext().
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // The file viewer frames these on the app's own origin: a stored file (PDFs in the browser's viewer) and the sandboxed renderer page.
      { source: '/api/files/:id/content', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      { source: '/api/connectors/:id/vault/files/:docId/content', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      { source: '/app/assets/viewer.html', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
};

export default nextConfig;
