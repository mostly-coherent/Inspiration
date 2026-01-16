import type { NextConfig } from "next";

// Safety check: prevent running from wrong directory (e.g., MyPrivateTools/Inspiration or Production_Clones)
// Allows any directory ending in /Inspiration (or just "Inspiration" at root)
const cwd = process.cwd();
const isInspirationDir = cwd.endsWith("/Inspiration") || cwd.endsWith("\\Inspiration") || cwd === "Inspiration";
const isBlockedDir = cwd.includes("MyPrivateTools") || cwd.includes("Production_Clones");
const isValidDirectory = isInspirationDir && !isBlockedDir;

if (!isValidDirectory && process.env.NODE_ENV !== "production") {
  console.error("\n❌ ERROR: Next.js started from wrong directory!");
  console.error(`   Current: ${cwd}`);
  console.error(`   Expected: Any directory named 'Inspiration'`);
  console.error(`   Blocked: MyPrivateTools/* and Production_Clones/*`);
  console.error("\n   This prevents accidental creation of .next in wrong locations\n");
  process.exit(1);
}

const nextConfig: NextConfig = {
  // Enable server actions for form handling
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Note: "params are being enumerated" warnings in console are harmless
  // They occur when dev tools/Cursor AI inspects the DOM and tries to serialize
  // searchParams objects. All pages using searchParams have proper Suspense wrappers.
};

export default nextConfig;

