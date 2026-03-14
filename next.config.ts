import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    unoptimized: true, // Vercel 무료 플랜 이미지 최적화 한도 방지
  },
};

export default nextConfig;