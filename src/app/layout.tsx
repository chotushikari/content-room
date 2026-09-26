import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';

/**
 * Three faces, three jobs, no overlap.
 *
 * Self-hosted at build time, so the browser makes no request to Google.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  weight: ['600', '700', '800'],
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Content Room — find out before you publish',
  description:
    'Paste a post and a hundred synthetic readers react to it. See who ignores you, who argues back, and exactly what to change — before you publish.',
  openGraph: {
    title: 'Content Room — find out before you publish',
    description:
      'A hundred synthetic readers react to your content, disagree about it, and tell you what to change.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${interTight.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
