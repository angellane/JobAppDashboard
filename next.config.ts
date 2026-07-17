import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these out of the server bundle — they load native/worker assets at
  // runtime and don't bundle cleanly.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
};

export default nextConfig;
