"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDashboard } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { WebRenterPlayer } from "@/components/WebRenterPlayer";

export default function StreamPage({ params }: { params: Promise<{ rentalId: string }> }) {
  const router = useRouter();
  const [rentalId, setRentalId] = useState<string | null>(null);
  const [machineName, setMachineName] = useState<string | undefined>();

  useEffect(() => {
    void params.then((p) => setRentalId(p.rentalId));
  }, [params]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (!rentalId) return;
    void fetchDashboard()
      .then((dash) => {
        const session = dash.activeSessions.find((s) => s.rentalId === rentalId);
        if (session) setMachineName(session.machineName);
      })
      .catch(() => {});
  }, [rentalId, router]);

  if (!rentalId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  return <WebRenterPlayer rentalId={rentalId} machineName={machineName} />;
}
