import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The pipeline packages are TypeScript source, compiled by Next at build.
  transpilePackages: ["@docscout/core", "@docscout/db", "@docscout/pipeline"],
  typedRoutes: true,
};

export default config;
