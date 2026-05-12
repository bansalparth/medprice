"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageview, getSid } from "@/lib/tracking-client";

export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    getSid();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    if (last.current === pathname) return;
    last.current = pathname;
    trackPageview(pathname);
  }, [pathname]);

  return <>{children}</>;
}
