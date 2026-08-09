/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is run separately in CI/dev; don't block production builds on it.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
