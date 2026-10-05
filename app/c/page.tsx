import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { CodeFields, CodeForm } from "./code-form";

export const metadata: Metadata = buildMetadata({
  title: "Verify a certificate",
  description: "Check that a Green University Computer Club certificate is genuine: enter the code printed under its QR code.",
  path: "/c",
  image: { eyebrow: "GUCC", title: "Verify a certificate", subtitle: "Enter the code under the QR code" },
});

/** Enter a certificate's code (GUCC-XXXX-…) to open its verification page. Static: the form does the rest. */
export default function VerifyCertificate() {
  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-16">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BadgeCheck className="h-6 w-6" aria-hidden /></span>
        <h1 className="text-2xl font-bold tracking-tight">Verify a certificate</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every GUCC certificate has a code under its QR code, like GUCC-7K3M-Q9TB-X2HD-PV4E. Enter it to see the certificate and who it was issued to.</p>
        <Suspense fallback={<CodeFields />}><CodeForm /></Suspense>
      </div>
    </div>
  );
}
