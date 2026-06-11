"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchMe,
  fetchStoragePlans,
  updateRenterPlan,
  uploadCloudFile,
  type RenterProfile,
  type StoragePlan,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function StoragePage() {
  const router = useRouter();
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<StoragePlan[]>([]);
  const [profile, setProfile] = useState<RenterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionNote, setRegionNote] = useState("");
  const [demoPath, setDemoPath] = useState("Documents/notes.txt");
  const [demoText, setDemoText] = useState("Hello from my SkyPC personal layer!");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      setError(null);
      const [plansRes, me] = await Promise.all([fetchStoragePlans(), fetchMe()]);
      setPlans(plansRes.plans);
      setRegionNote(plansRes.note);
      setProfile(me.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.replace("/login");
      return;
    }
    if (isLoggedIn) load();
  }, [authLoading, isLoggedIn, load, router]);

  async function selectPlan(planId: string) {
    setSaving(planId);
    setError(null);
    try {
      const updated = await updateRenterPlan(planId);
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSaving(null);
    }
  }

  if (authLoading || (!isLoggedIn && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Back to SkyPC
          </Link>
          <span className="text-sm text-muted">Personal cloud storage</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Personal cloud storage</h1>
        <p className="mt-4 text-muted leading-relaxed">
          Your files live in <strong className="text-foreground">cloud storage</strong> (Singapore
          in production) — not on the host PC. Each session downloads your personal layer, then
          uploads changes when you disconnect. Speed depends on your internet, not cloud latency.
        </p>

        {loading && <p className="mt-8 text-muted">Loading…</p>}

        {error && (
          <p className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {profile && (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-medium">Your usage</h2>
            <p className="mt-1 text-sm text-muted">
              Plan: <span className="text-foreground">{profile.planName}</span> ·{" "}
              {profile.priceFormatted}
            </p>
            {profile.quotaBytes > 0 ? (
              <>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${profile.usagePercent}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {profile.usedFormatted} of {profile.quotaFormatted} used
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">No cloud storage — ephemeral sessions only.</p>
            )}
            <p className="mt-3 text-xs text-muted">
              Backend: {profile.storageBackend} · Region: {profile.cloudRegion}
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-4">
          {plans.map((plan) => {
            const active = profile?.storagePlan === plan.id;
            return (
              <article
                key={plan.id}
                className={`rounded-2xl border p-6 transition-colors ${
                  active ? "border-accent bg-accent/5" : "border-border bg-surface"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">{plan.name}</h3>
                    <p className="mt-2 text-sm text-muted">{plan.description}</p>
                    {plan.quotaGb > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        Tip: keep under ~1 GB for sub-minute opens on typical PH fiber.
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-accent">{plan.priceFormatted}</p>
                    {plan.quotaGb > 0 && (
                      <p className="text-xs text-muted">{plan.quotaGb} GB quota</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={active || saving === plan.id}
                  onClick={() => selectPlan(plan.id)}
                  className="mt-4 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-accent/40 disabled:cursor-default disabled:opacity-50"
                >
                  {active ? "Current plan" : saving === plan.id ? "Saving…" : "Select plan"}
                </button>
              </article>
            );
          })}
        </div>

        {profile && profile.quotaBytes > 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-medium">Test upload to cloud</h2>
            <p className="mt-2 text-sm text-muted">
              Saves to cloud only — simulates files you&apos;d restore on next rental.
            </p>
            <input
              value={demoPath}
              onChange={(e) => setDemoPath(e.target.value)}
              className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Documents/notes.txt"
            />
            <textarea
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={async () => {
                setUploading(true);
                setError(null);
                try {
                  await uploadCloudFile(
                    demoPath,
                    btoa(unescape(encodeURIComponent(demoText)))
                  );
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setUploading(false);
                }
              }}
              className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {uploading ? "Saving…" : "Save to cloud"}
            </button>
          </div>
        )}

        {regionNote && <p className="mt-8 text-sm text-muted">{regionNote}</p>}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/#for-renters"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-background"
          >
            Browse PCs
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-border px-5 py-2.5 text-sm"
          >
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
