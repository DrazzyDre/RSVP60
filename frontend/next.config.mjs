/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // ESLint is optional for this MVP; don't let lint config block production builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
