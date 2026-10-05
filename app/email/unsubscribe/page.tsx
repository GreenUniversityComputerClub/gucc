import type { Metadata } from "next";
import { UnsubscribeForm } from "./form";

export const metadata: Metadata = {
  title: { absolute: "Email choices | GUCC" },
  description: "Stop or restart Green University Computer Club announcement emails.",
  robots: { index: false, follow: false },
};

/** Where an announcement email's "Unsubscribe" link lands: one button to confirm. */
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-16">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {t ? <UnsubscribeForm token={t} /> : (
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">This link is incomplete</h1>
            <p className="mt-2 text-sm text-muted-foreground">Use the unsubscribe link at the bottom of the email, or change your email choices in your profile.</p>
          </div>
        )}
      </div>
    </div>
  );
}
