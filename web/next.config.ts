import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  ...(isProd ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep `pg` as a runtime require so its internal dynamic loads work in route handlers and proxy.
  serverExternalPackages: ['pg'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default config;
