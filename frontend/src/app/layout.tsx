import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThreadProvider } from "@/context/ThreadContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fictional Bassoon",
  description: "AI Chat Assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <ThreadProvider>{children}</ThreadProvider>
      </body>
    </html>
  );
}
