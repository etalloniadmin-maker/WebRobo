import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Web Robo" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-semibold tracking-tight">Web Robo</Link>
              <nav className="flex gap-4 text-sm text-neutral-600">
                <Link href="/flow/discovery" className="hover:text-neutral-900">Pipeline</Link>
                <Link href="/templates" className="hover:text-neutral-900">Șabloane email</Link>
                <Link href="/settings" className="hover:text-neutral-900">Setări</Link>
              </nav>
            </div>
            <a href="http://localhost:8288" target="_blank" className="text-sm text-neutral-400 hover:text-neutral-900">Inngest ↗</a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
