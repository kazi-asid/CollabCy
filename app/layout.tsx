import type { Metadata } from "next";
import "./globals.css";
import "./attention/attention.css";

export const metadata: Metadata = {
  title: "GoHIGHnet — Creator & Brand Collaborations",
  description: "Discover your next brand collaboration. Connect, negotiate, and create with GoHIGHnet.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/logo.PNG",
    shortcut: "/logo.PNG",
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
