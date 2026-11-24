import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 开启纯静态导出，生成 out/ 目录以部署到 Cloudflare Pages
  output: 'export',

  trailingSlash: true,

  // 下面这些可以保留
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true, // 忽略 TS 错误，方便快速部署
  },
};

export default nextConfig;