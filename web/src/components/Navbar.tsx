"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const links = [
  { href: "#overview", label: "Overview" },
  { href: "#how-it-works", label: "Protocol" },
  { href: "/host", label: "Host" },
  { href: "/storage", label: "Storage" },
  { href: "#for-renters", label: "Fleet" },
];

export function Navbar() {
  const { isLoggedIn, loading, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center border border-accent/40 bg-accent/5 font-mono text-xs font-bold text-accent transition-colors group-hover:border-accent group-hover:bg-accent/10">
            PC
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-semibold tracking-[0.2em] text-foreground">PCHUB</span>
            <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.35em] text-muted">
              compute network
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 font-mono text-[11px] uppercase tracking-widest text-muted md:flex">
          {links.map((link) =>
            link.href.startsWith("/") ? (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-accent"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-accent"
              >
                {link.label}
              </a>
            )
          )}
        </nav>
        <div className="flex items-center gap-3">
          {!loading && (
            <>
              {isLoggedIn ? (
                <>
                  <Link href="/dashboard" className="pchub-btn-primary px-4 py-2 text-[11px]">
                    Console
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="hidden font-mono text-[10px] uppercase tracking-widest text-muted hover:text-foreground sm:inline"
                  >
                    Exit
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-accent"
                  >
                    Log in
                  </Link>
                  <Link href="/signup" className="pchub-btn-primary px-4 py-2 text-[11px]">
                    Join
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
