"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const links = [
  { href: "#overview", label: "Overview" },
  { href: "#how-it-works", label: "How it works" },
  { href: "/host", label: "Host setup" },
  { href: "/storage", label: "Storage" },
  { href: "#for-renters", label: "Browse" },
];

export function Navbar() {
  const { isLoggedIn, loading, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-sm text-accent">
            SK
          </span>
          SkyPC
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          {links.map((link) =>
            link.href.startsWith("/") ? (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
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
                  <Link
                    href="/dashboard"
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim"
                  >
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="hidden text-sm text-muted hover:text-foreground sm:inline"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm text-muted transition-colors hover:text-foreground"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim"
                  >
                    Sign up
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
