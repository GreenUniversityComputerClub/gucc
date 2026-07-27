import type React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import FloatingChatbot from "@/components/chatbot/floating-chatbot";
import { ThemeProvider } from "@/components/theme-provider";
import DeadlinePopup from "@/components/DeadlinePopup";

export const metadata: Metadata = {
  title: "Green University Computer Club",
  description: "Official website of Green University Computer Club (GUCC)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body style={{ fontFamily: 'var(--font-sans)' }} suppressHydrationWarning>{/* Using system font fallback */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={true}
          disableTransitionOnChange={false}
        >
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
            <FloatingChatbot />
            <DeadlinePopup />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
