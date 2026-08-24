import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fontSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MintDash — Delegated NFT Minting Console",
  description:
    "One Operator wallet pays gas and mint price. NFTs land directly in your Receiver wallets. Preflight every mint before it costs you anything.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#5B7CFF",
          colorBackground: "#12161F",
          colorText: "#E7E9EE",
          colorTextSecondary: "#8A93A6",
          colorInputBackground: "#0B0E14",
          colorInputText: "#E7E9EE",
          colorNeutral: "#E7E9EE",
          borderRadius: "0.5rem",
        },
      }}
    >
      <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
