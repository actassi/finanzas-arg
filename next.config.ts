import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    root: __dirname,
  },
};
