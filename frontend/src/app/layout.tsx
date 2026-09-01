import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import { ThreadProvider } from '@/context/ThreadContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Relay',
  description: 'Chat with a reasoning agent. Search when it needs facts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>
          <ThreadProvider>{children}</ThreadProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
