"use client";
import { useEffect } from "react";

export function OnlineTracker() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") {
        fetch("/api/ping", { method: "POST" });
      }
    };

    ping(); // ping immediately on mount
    const interval = setInterval(ping, 60_000); // every 60 seconds
    document.addEventListener("visibilitychange", ping); // ping on tab focus

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
