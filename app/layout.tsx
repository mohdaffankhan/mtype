import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['200', '300', '400', '500', '600'], variable: '--font-ui' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Stillpoint',
  description: 'A typing defense game. Hold your ground solo, or race and battle friends.',
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
  // Shrink the layout when the on-screen keyboard opens instead of covering the ship.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
