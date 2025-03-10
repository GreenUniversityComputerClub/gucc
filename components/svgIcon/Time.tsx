import React from "react";
import { cn } from "@/lib/utils";
export default function Time({ className }: { className?: string }) {
  return (
    <svg
      className={cn("w-6 h-6 text-gray-400 mr-3", className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
