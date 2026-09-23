import Link from "next/link";
import os from "os";
import { headers } from "next/headers";
import { APP_NAME, APP_TAGLINE } from "@/lib/game-config";

/** This laptop's addresses on the local network, so phones and tablets know where to connect. */
function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

export default async function Home() {
  const host = (await headers()).get("host") ?? "localhost:3000";
  const port = host.includes(":") ? host.split(":").pop() : "80";
  const addresses = lanAddresses();
  const base = (ip: string) => `http://${ip}${port === "80" ? "" : `:${port}`}`;

  return (
    <main className="screen results-screen hub-screen">
      <div>
        <p className="eyebrow">{APP_TAGLINE}</p>
        <h1 className="title">{APP_NAME}</h1>
      </div>

      <div className="hub-cards">
        <Link href="/host" className="hub-card">
          <span className="hub-icon" aria-hidden>📱</span>
          <strong>Host controls</strong>
          <span className="muted">Open on your phone. Sign in with the admin password.</span>
          <code>/host</code>
        </Link>
        <Link href="/display" className="hub-card">
          <span className="hub-icon" aria-hidden>🖥️</span>
          <strong>Display</strong>
          <span className="muted">Open on the contestant&apos;s computer and on the tablet.</span>
          <code>/display</code>
        </Link>
      </div>

      <section className="ranking-section">
        <h2 className="hub-h2">Open these on the phone and tablet</h2>
        {addresses.length === 0 ? (
          <p className="error">
            This laptop isn&apos;t connected to a network. Join the venue Wi-Fi, then refresh this page.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {addresses.map((ip) => (
                  <tr key={ip}>
                    <td>
                      📱 Host phone
                      <br />
                      🖥️ Computer &amp; tablet
                    </td>
                    <td>
                      <code className="hub-url">{base(ip)}/host</code>
                      <br />
                      <code className="hub-url">{base(ip)}/display</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          All devices must be on the same Wi-Fi as this laptop. If a phone can&apos;t connect, allow Node.js through
          Windows Firewall for private networks. If several addresses are listed, use the one for the Wi-Fi the phone
          and tablet are on.
        </p>
      </section>

      <nav className="setup-links">
        <Link href="/rankings" className="link">
          Rankings →
        </Link>
        <Link href="/admin" className="link">
          Admin →
        </Link>
        <Link href="/classic" className="link">
          Single-screen version (fallback) →
        </Link>
      </nav>
    </main>
  );
}
