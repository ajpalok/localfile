import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1', '::1'],
  turbopack: {},
  // Reduce hot reloading frequency to prevent unwanted page reloads
  webpack: (config, { dev }) => {
    if (dev) {
      // Reduce hot reloading frequency but don't disable it completely
      config.watchOptions = {
        poll: 10000, // Check every 10 seconds instead of continuously
        aggregateTimeout: 2000, // Wait 2 seconds after changes
        ignored: ['**/node_modules', '**/.next', '**/.git', '**/dist'],
      };

      // Keep hot module replacement but make it less aggressive
      // Filter out only problematic HMR plugins if needed
    }
    return config;
  },
};

export default nextConfig;
