import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.PMOS_DEV_DIST || '.next',
  devIndicators: false
}

export default nextConfig
