"use client";

import Link from "next/link";
import { useState } from "react";
import AdminLogin from "./AdminLogin";
import { APP_NAME } from "@/lib/game-config";
import type { QuestionStats } from "@/lib/question-stats";

/**
 * The unlock token lives only in this component's state: leaving or refreshing the page
 * locks Admin again, so the password is asked for on every visit.
 */
export default function AdminPanel({ firstTime, minLength }: { firstTime: boolean; minLength: number }) {
  const [token, setToken] = useState<string | null>(null);
  const [passwordSet, setPasswordSet] = useState(!firstTime); // true once created, even before a reload
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  function lock() {
    setToken(null);
    setStats(null);
    setError(null);
  }

  async function loadStats(t: string) {
    try {
      const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      if (res.status === 401) return lock();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load question counts.");
      setStats(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function unlock(t: string) {
    setPasswordSet(true);
    setToken(t);
    void loadStats(t);
  }

  async function resetQuestions() {
    if (!token || !stats) return;
    const ok = window.confirm(
      `Reset question usage?\n\nAll ${stats.overall.asked} asked questions will count as "left" again and can be picked like new. ` +
        "Results and rankings are not affected.",
    );
    if (!ok) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-questions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return lock();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not reset.");
      await loadStats(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="screen results-screen">
      <div className="results-head">
        <div>
          <p className="eyebrow">{APP_NAME}</p>
          <h1 className="title">Admin</h1>
        </div>
        <div className="actions head-actions">
          {token && (
            <button type="button" className="secondary" onClick={lock}>
              🔒 Lock
            </button>
          )}
          <Link href="/rankings" className="button secondary">
            Rankings
          </Link>
          <Link href="/" className="button primary">
            Back to setup
          </Link>
        </div>
      </div>

      {!token ? (
        <AdminLogin firstTime={!passwordSet} minLength={minLength} onUnlocked={unlock} />
      ) : error ? (
        <p className="error">{error}</p>
      ) : !stats ? (
        <p className="muted">Loading…</p>
      ) : (
        <StatsView stats={stats} onReset={resetQuestions} resetting={resetting} />
      )}
    </main>
  );
}

function StatsView({ stats, onReset, resetting }: { stats: QuestionStats; onReset: () => void; resetting: boolean }) {
  const { overall, granths, tiers, contestantsPerDay } = stats;
  return (
    <>
      <section className="ranking-section">
        <div className="section-head">
          <h2>Questions left</h2>
          <span className="muted">
            {overall.left} of {overall.total} never asked · {overall.askedToday} asked today
          </span>
        </div>
        <div className="stat-cards">
          {tiers.map((t) => (
            <div key={t.difficulty} className={`stat-card ${t.low ? "stat-low" : ""}`}>
              <div className="stat-head">
                <span className={`tier-badge tier-${t.difficulty}`}>{t.difficulty}</span>
                {t.low && <span className="low-badge">Running low</span>}
              </div>
              <div className="stat-big">
                {t.left}
                <span className="muted"> / {t.total} left</span>
              </div>
              <div className="stat-bar">
                <div className="stat-fill" style={{ width: `${t.total ? (t.left / t.total) * 100 : 0}%` }} />
              </div>
              <dl className="stat-list">
                <dt>Asked so far</dt>
                <dd>{t.asked}</dd>
                <dt>Asked today</dt>
                <dd>{t.askedToday}</dd>
                <dt>Full days left</dt>
                <dd title={`A full day uses up to ${t.perDay}`}>{t.fullDaysLeft}</dd>
              </dl>
            </div>
          ))}
        </div>
        <p className="muted small">
          &ldquo;Left&rdquo; means never asked on any day. &ldquo;Full days left&rdquo; assumes {contestantsPerDay}{" "}
          contestants who all reach the end ({tiers.map((t) => `${t.perDay} ${t.difficulty}`).join(", ")} per day). Most
          contestants go out early, so the real number is higher. Once a category runs out, the app reuses questions from
          earlier days.
        </p>
      </section>

      <section className="ranking-section">
        <div className="section-head">
          <h2>By granth</h2>
          <span className="muted">left / total</span>
        </div>
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Difficulty</th>
                {granths.map((g) => (
                  <th key={g} className="num">
                    {g}
                  </th>
                ))}
                <th className="num">All</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.difficulty}>
                  <td className="capitalize">{t.difficulty}</td>
                  {granths.map((g) => (
                    <td key={g} className="num">
                      {t.byGranth[g].left} / {t.byGranth[g].total}
                    </td>
                  ))}
                  <td className="num">
                    <strong>{t.left}</strong> / {t.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ranking-section">
        <div className="reset-box">
          <div>
            <strong>Reset question usage</strong>
            <p className="muted small">
              Marks every question as never asked. Use it before the event starts, or if you want to reuse the whole
              bank.
            </p>
          </div>
          <button type="button" className="danger" onClick={onReset} disabled={resetting || overall.asked === 0}>
            {resetting ? "Resetting…" : "Reset questions"}
          </button>
        </div>
      </section>
    </>
  );
}

