"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout itself. It renders
 * its own <html>/<body>, because at this point the root layout is what failed.
 */
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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#020617",
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "#94a3b8", maxWidth: "28rem", margin: 0 }}>
          The Green University Computer Club site hit an unexpected error.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            padding: "0.6rem 1.4rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#22c55e",
            color: "#052e16",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
