"use client";

import { useState } from "react";
import Link from "next/link";
import { createPairingCode, getApiUrl } from "@/lib/api";
import { downloadWindowsAgentBundle } from "@/lib/host-installer";

export default function HostPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [machineName, setMachineName] = useState("My Gaming PC");
  const [machineCity, setMachineCity] = useState("Manila");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateCode() {
    setLoading(true);
    setError(null);
    try {
      const result = await createPairingCode();
      setCode(result.code);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create code");
    } finally {
      setLoading(false);
    }
  }

  async function downloadInstaller() {
    if (!code) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadWindowsAgentBundle({
        apiUrl: getApiUrl(),
        pairingCode: code,
        machineName,
        machineCity,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-accent">
            ← PCHUB
          </Link>
          <span className="eyebrow text-muted">Host deploy</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="eyebrow">Supply node</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Register hardware</h1>
        <p className="mt-4 text-muted leading-relaxed">
          The website handles pairing and downloads. A small{" "}
          <strong className="text-foreground">Windows agent</strong> runs on your PC to detect
          hardware, measure upload speed, and stay online for renters.
        </p>

        <div className="mt-6 pchub-panel p-5 text-sm text-muted">
          <h2 className="font-medium text-foreground">Why not a pure website?</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Browsers cannot read CPU, GPU, RAM, or disk — and cannot run in the background
              after you close the tab.
            </li>
            <li>
              Real upload speed must be measured from your PC to our servers, not guessed in
              JavaScript.
            </li>
            <li>
              Renters need a always-on daemon (like Steam) for heartbeats, storage sync, and
              future remote desktop.
            </li>
          </ul>
          <p className="mt-3">
            <strong className="text-foreground">Download:</strong> a zip with{" "}
            <code className="text-foreground">PCHUB-Agent.exe</code> — no Node.js, no extra installs.
            Double-click <code className="text-foreground">SkyPC-Setup.bat</code> once.
          </p>
        </div>

        <div className="mt-10 pchub-panel p-6">
          <h2 className="font-medium">Step 1 — Pairing code</h2>
          <p className="mt-2 text-sm text-muted">Valid for 30 minutes. One code = one PC.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">PC name</span>
              <input
                type="text"
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                className="mt-1 w-full pchub-input"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">City</span>
              <input
                type="text"
                value={machineCity}
                onChange={(e) => setMachineCity(e.target.value)}
                className="mt-1 w-full pchub-input"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={generateCode}
            disabled={loading}
            className="mt-4 pchub-btn-primary px-5 py-2.5 text-sm"
          >
            {loading ? "Generating…" : code ? "Generate new code" : "Generate pairing code"}
          </button>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          {code && (
            <div className="mt-6 border border-accent/40 bg-accent/5 p-4">
              <p className="text-xs uppercase tracking-wider text-muted">Your code</p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-accent">
                {code}
              </p>
              {expiresAt && (
                <p className="mt-2 text-xs text-muted">
                  Expires {new Date(expiresAt).toLocaleString()}
                </p>
              )}
              <button
                type="button"
                onClick={downloadInstaller}
                disabled={downloading}
                className="mt-4 pchub-btn-primary px-5 py-2.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {downloading ? "Preparing zip…" : "Download Windows agent (.zip)"}
              </button>
              <p className="mt-2 text-xs text-muted">
                Includes your pairing code in config.json — no copy/paste needed.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 pchub-panel p-6">
          <h2 className="font-medium">Step 2 — Windows PC (one double-click)</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted">
            <li>
              <strong className="text-foreground">Extract All</strong> the zip to a folder (e.g. Desktop
              → <code className="text-foreground">SkyPC-Host-Agent</code>). If Windows asks{" "}
              <em>Extract</em> or <em>Run</em>, choose <strong className="text-foreground">Extract</strong>{" "}
              — running from inside the zip will fail.
            </li>
            <li>
              Double-click{" "}
              <code className="text-foreground">SkyPC-Setup.bat</code> in that folder (no Node.js needed)
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted">
            Setup detects CPU, GPU, RAM, disk, runs a 2 MB upload/download speed test, registers
            with PCHUB, and starts the agent in the background (no terminal left open).
          </p>
          <p className="mt-2 text-xs text-muted">
            Optional: <code className="text-foreground">add-to-startup.bat</code> to run on Windows
            login · Logs: <code className="text-foreground">agent.log</code>
          </p>
        </div>

        <div className="mt-6 pchub-panel p-6">
          <h2 className="font-medium">Developers (Mac / terminal)</h2>
          <p className="mt-2 text-sm text-muted">API: {getApiUrl()}</p>
          <pre className="mt-3 overflow-x-auto bg-background border border-border p-4 font-mono text-xs">
            {`# Place config.json in agent/ with your pairing code, then:
npm run agent`}
          </pre>
        </div>

        <div className="mt-6 pchub-panel p-6">
          <h2 className="font-medium">Step 3 — Check listings</h2>
          <p className="mt-2 text-sm text-muted">
            Your PC should show as <strong className="text-emerald-400">Online</strong> with real
            specs and ↑ upload Mbps within a minute.
          </p>
          <Link
            href="/#for-renters"
            className="mt-4 inline-block pchub-btn-ghost px-4 py-2 text-[11px] transition-colors hover:border-accent/40"
          >
            View listings →
          </Link>
        </div>
      </main>
    </div>
  );
}
