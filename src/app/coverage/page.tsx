"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * DEPRECATED: Coverage Intelligence is now integrated into the main page.
 * This page redirects to home for backwards compatibility.
 */
export default function CoveragePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-400">Redirecting to home...</p>
        <p className="text-slate-500 text-sm mt-2">
          Coverage Intelligence is now on the main page.
        </p>
      </div>
    </div>
  );
}
