import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev-tools badge sits bottom-right at phone width, exactly
  // over the comment send button — hide it so dev matches what users see.
  devIndicators: false,
};

export default nextConfig;
