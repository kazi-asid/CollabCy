import type { Metadata } from "next";
import "./globals.css";
import "./attention/attention.css";
import "./collabcy.css";

export const metadata: Metadata = {
  title: "CollabCy — Where influence meets opportunity",
  description: "Find your people. Build your next collaboration. A shared home for independent creators, ambitious brands, and products worth discovering.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/collabcy-mark.svg",
    shortcut: "/collabcy-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
