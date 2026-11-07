import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackUTD Workspace",
  description: "HackUTD NVIDIA and CBRE track workspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
