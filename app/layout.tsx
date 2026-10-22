import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { GuardianAuthProvider } from "@/lib/tidecloak/client";

/** One family for brand + UI — weight and size carry hierarchy. */
const sourceSans = Source_Sans_3({
  variable: "--font-guardian",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guardian Circle",
  description:
    "Big decisions need the people Margaret trusts to agree before they go through.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <GuardianAuthProvider>{children}</GuardianAuthProvider>
      </body>
    </html>
  );
}
