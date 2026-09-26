import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The simulation streams for tens of seconds; keep route handlers on Node.
  serverExternalPackages: ['d3-force'],
};

export default nextConfig;
