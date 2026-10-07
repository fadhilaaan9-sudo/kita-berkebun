/** @type {import('next').NextConfig} */
const nextConfig = {
  // shared/ ditulis TypeScript — ikut di-transpile Next.js
  transpilePackages: ["@kebun-kita/shared"],
};

export default nextConfig;
