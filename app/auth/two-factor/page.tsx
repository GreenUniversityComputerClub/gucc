import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor sign-in", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <TwoFactorForm />
        </Suspense>
      </div>
    </div>
  );
}
