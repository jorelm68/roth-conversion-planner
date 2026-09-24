import type { Metadata } from "next";
import { PlannerProvider } from "@/components/PlannerProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roth Conversion Planner",
  description: "Find the Traditional-to-Roth IRA conversion schedule that maximizes your after-tax wealth. Runs entirely in your browser; nothing is stored or sent anywhere.",
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
