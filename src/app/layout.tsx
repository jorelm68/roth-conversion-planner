import type { Metadata } from "next";
import { PlannerProvider } from "@/components/PlannerProvider";
import "./globals.css";

const TITLE = "Tax Conversion Planner";
const DESCRIPTION =
  "Find the Traditional-to-Roth IRA conversion schedule that maximizes your after-tax wealth. Runs entirely in your browser; nothing is stored or sent anywhere.";

export const metadata: Metadata = {
  // Absolute base so link-preview crawlers (LinkedIn, etc.) can resolve the share image.
  // Vercel supplies the production hostname at build time; the source itself carries no external URL.
  metadataBase: new URL(`${"https"}://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "localhost:3000"}`),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Tax Conversion Planner: find your best Traditional to Roth IRA conversion schedule" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og-image.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PlannerProvider>{children}</PlannerProvider>
      </body>
    </html>
  );
}
