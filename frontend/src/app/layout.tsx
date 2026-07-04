import * as React from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GatherArc — From invite to arrival",
    template: "%s · GatherArc",
  },
  description:
    "Invitations, RSVPs, guest communications, and event-day operations in one place.",
  applicationName: "GatherArc",
  icons: {
    icon: "/brand/gatherarc-mark.png",
    apple: "/brand/gatherarc-mark.png",
  },
  openGraph: {
    title: "GatherArc",
    description:
      "Invitations, RSVPs, guest communications, and event-day operations in one place.",
    siteName: "GatherArc",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
