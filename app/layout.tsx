import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guest Vaults",
  description: "Track your balance, bills, debt, and savings in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
