"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#09090b",
          color: "#fafafa",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 420,
            padding: 32,
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            background: "rgba(255,255,255,0.03)",
            backdropFilter: "blur(12px)",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 16 }}
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 48,
              fontWeight: "bold",
              color: "#dc2626",
              margin: "0 0 8px",
              letterSpacing: "-0.05em",
            }}
          >
            500
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Critical Error
          </h1>
          <p style={{ fontSize: 14, color: "#a1a1aa", margin: "0 0 32px" }}>
            The application encountered a fatal error. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 500,
              color: "#fafafa",
              background: "#dc2626",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
