"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteResultButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete ${name}'s result? This removes it from today's and the overall ranking.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/results?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
      router.refresh();
    } catch {
      window.alert("Could not delete the result. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="delete-button" onClick={remove} disabled={busy} aria-label={`Delete ${name}`}>
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
