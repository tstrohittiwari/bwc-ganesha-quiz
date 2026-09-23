import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` only trusts localhost by default, so a phone or tablet opening the laptop's Wi-Fi
  // address would get a blank page. Allow private local-network addresses (each * is one number).
  // `npm run quiz` (production) doesn't need this.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
};

export default nextConfig;
