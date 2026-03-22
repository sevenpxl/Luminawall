/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",      // Tauri needs a static bundle in /out
  trailingSlash: true,   // required for static export
  images: { unoptimized: true },
};

module.exports = nextConfig;
