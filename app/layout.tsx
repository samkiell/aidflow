import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AidFlow | Transparent aid, delivered', description: 'Track donations and aid distribution with transparent, accountable workflows powered by Stellar.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
