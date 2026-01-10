import type { NextConfig } from "next";

// Safety check: prevent running from wrong directory (e.g., MyPrivateTools/Inspiration)
const cwd = process.cwd();
const expectedPaths = [
  "/Users/jmbeh/Personal Builder Lab/Inspiration",
  "Personal Builder Lab/Inspiration",
];
const isValidDirectory = expectedPaths.some(p => cwd.endsWith(p)) && 
  !cwd.includes("MyPrivateTools") && 
  !cwd.includes("Production_Clones");

if (!isValidDirectory && process.env.NODE_ENV !== "production") {
  console.error("\n❌ ERROR: Next.js started from wrong directory!");
  console.error(`   Current: ${cwd}`);
  console.error(`   Expected: */Personal Builder Lab/Inspiration`);
  console.error("\n   This prevents accidental creation of MyPrivateTools/Inspiration/.next\n");
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

