"use client";

import { useState, type FormEvent } from "react";

interface Props {
  firstTime: boolean;
  minLength: number;
  onUnlocked: (token: string) => void;
}

export default function AdminLogin({ firstTime, minLength, onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (firstTime && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not log in.");
      onUnlocked(data.token);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="setup-form admin-login" onSubmit={submit}>
      <p className="muted">
        {firstTime
          ? `Create the admin password (at least ${minLength} characters). You'll need it every time you open Admin.`
          : "Enter the admin password."}
      </p>
      <label htmlFor="admin-password">{firstTime ? "New password" : "Password"}</label>
      <input
        id="admin-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        autoComplete={firstTime ? "new-password" : "current-password"}
        disabled={busy}
      />
      {firstTime && (
        <>
          <label htmlFor="admin-password-confirm">Type it again</label>
          <input
            id="admin-password-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
          />
        </>
      )}
      <button type="submit" className="primary" disabled={busy || !password}>
        {busy ? "Checking…" : firstTime ? "Set password" : "Unlock"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
