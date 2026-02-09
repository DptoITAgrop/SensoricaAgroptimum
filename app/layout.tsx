import React from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// ✅ Fuente corporativa (local) - Margem
const margem = localFont({
  variable: "--font-margem",
  display: "swap",
  src: [
    {
      path: "../assets/Fabio Haag Type - Margem Light (1).otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../assets/Fabio Haag Type - Margem Light Italic.otf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../assets/Fabio Haag Type - Margem Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../assets/Fabio Haag Type - Margem Medium Italic.otf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../assets/Fabio Haag Type - Margem Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
});

// (Opcional) mono para código
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Agroptimum - Shaping Pistachio Industry",
  description:
    "Sistema profesional de monitoreo agroclimático para cultivo de pistacho - Agroptimum",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${margem.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
