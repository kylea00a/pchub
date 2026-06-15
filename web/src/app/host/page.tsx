"use client";

import { useState } from "react";
import Link from "next/link";
import { createPairingCode, getAgentApiUrl, getApiUrl } from "@/lib/api";
import {
  buildWindowsBundleDownloadUrl,
  buildWindowsDownloadCommand,
  HOST_INSTALLER_CMD,
  type HostInstallerConfig,
} from "@/lib/host-installer";

function installerConfig(
  code: string,
  machineName: string,
  machineCity: string
): HostInstallerConfig {
  return {
    apiUrl: getAgentApiUrl(),
    pairingCode: code,
    machineName,
    machineCity,
  };
}

export default function HostPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [machineName, setMachineName] = useState("My Gaming PC");
  const [machineCity, setMachineCity] = useState("Manila");
  const [loading, setLoading] = useState(false);
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

  const installer = code ? installerConfig(code, machineName, machineCity) : null;
  const zipFallbackUrl = installer ? buildWindowsBundleDownloadUrl(installer) : null;
  const windowsCommand = installer
    ? buildWindowsDownloadCommand("https://pchub.cloud", installer)
    : null;

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
          Generate a pairing code, download the Windows app, click through the setup wizard.
          One installer — <strong className="text-foreground">Next → Next → Finish</strong> — then a small status app stays in your taskbar.
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
              Renters need an always-on daemon for heartbeats, storage sync, and remote desktop
              via the PCHUB relay.
            </li>
          </ul>
        </div>

        <div className="mt-10 pchub-panel p-6">
          <h2 className="font-medium">Step 1 — Pairing code</h2>
          <p className="mt-2 text-sm text-muted">Valid for 30 minutes. One code = one PC.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">PC name (for installer)</span>
              <input
                type="text"
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                className="mt-1 w-full pchub-input"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">City (for installer)</span>
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
              <p className="text-xs uppercase tracking-wider text-muted">Your code — paste in installer</p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-accent">
                {code}
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(code)}
                className="mt-2 border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10"
              >
                Copy code
              </button>
              {expiresAt && (
                <p className="mt-2 text-xs text-muted">
                  Expires {new Date(expiresAt).toLocaleString()}
                </p>
              )}
              <a
                href={HOST_INSTALLER_CMD}
                className="mt-4 block w-full pchub-btn-primary px-5 py-2.5 text-center text-sm font-medium text-background"
              >
                Download PCHUB Host Setup
              </a>
              <p className="mt-2 text-xs text-muted">
                One file — double-click on Windows, paste your pairing code, click Install.
                Right-click → <strong className="text-foreground">Run as administrator</strong> if prompted.
                Installer version <strong className="text-foreground">2026.06.10.4</strong> shows top-right.
              </p>
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer text-foreground">Installer didn&apos;t download?</summary>
                <p className="mt-2">
                  Try the zip fallback or paste in Command Prompt (<kbd>Win+R</kbd> →{" "}
                  <code>cmd</code>):
                </p>
                {zipFallbackUrl && (
                  <p className="mt-2 break-all font-mono text-[11px]">
                    <a href={zipFallbackUrl} className="text-accent hover:underline">
                      Zip download (fallback)
                    </a>
                  </p>
                )}
                {windowsCommand && (
                  <>
                    <pre className="mt-2 overflow-x-auto bg-background border border-border p-3 font-mono text-[11px]">
                      {windowsCommand}
                    </pre>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(windowsCommand)}
                      className="mt-2 border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10"
                    >
                      Copy command
                    </button>
                  </>
                )}
              </details>
            </div>
          )}
        </div>

        <div className="mt-6 pchub-panel p-6">
          <h2 className="font-medium">Step 2 — Windows PC</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted">
            <li>
              Download and run <code className="text-foreground">PCHUB-Host-Setup.cmd</code> (one file)
            </li>
            <li>
              Click <strong className="text-foreground">Next</strong>, enter your pairing code, PC name, and city
            </li>
            <li>
              Click <strong className="text-foreground">Install</strong> and approve the admin prompt
            </li>
            <li>
              When finished, <strong className="text-foreground">PCHUB Host</strong> opens — keep it running in the taskbar
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted">
            Setup installs Sunshine + the PCHUB relay tunnel. Renters connect with Moonlight — no router changes for you.
          </p>
          <p className="mt-2 text-xs text-muted">
            Desktop shortcut <strong className="text-foreground">PCHUB Host</strong> reopens the status app · Logs:{" "}
            <code className="text-foreground">C:\PCHUB-Host\agent.log</code>
          </p>
        </div>

        <div className="mt-6 pchub-panel p-6">
          <h2 className="font-medium">Developers (Mac / terminal)</h2>
          <p className="mt-2 text-sm text-muted">API: {getApiUrl()}</p>
          <pre className="mt-3 overflow-x-auto bg-background border border-border p-4 font-mono text-xs">
            {`# Dev agent:
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
