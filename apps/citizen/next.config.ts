import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Workspace packages ship TS source (no build step of their own), so Next
  // must transpile them itself rather than treating them as pre-built.
  transpilePackages: ['@pg/ui', '@pg/i18n', '@pg/api-client', '@pg/types'],
};

export default withNextIntl(nextConfig);
