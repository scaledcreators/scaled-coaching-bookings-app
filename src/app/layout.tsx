import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: { default: "Scaled Coaching", template: "%s · Scaled Coaching" },
  description: "Premium, manually confirmed coaching bookings inside Whop.",
};

export const viewport: Viewport = { colorScheme: "dark light", themeColor: "#121214" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
