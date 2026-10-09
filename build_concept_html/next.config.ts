import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind v4 runs as a Turbopack loader (set up by create-next-app).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The dev badge sits on top of the mock desktop; hide it.
  devIndicators: false,
};

export default nextConfig;
