// `npm run quiz`: builds the app, starts it for this laptop and devices on the same Wi-Fi, and opens the browser.
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";

const PORT = process.env.PORT || "3000";
const URL = `http://localhost:${PORT}`;
const isWin = process.platform === "win32";

// Files left behind by `npm run dev` can be half-written (e.g. if it was closed mid-save) and would
// fail the build's type check. They're only a cache, so clear them first.
fs.rmSync(".next/dev", { recursive: true, force: true });

console.log("Building the quiz app…");
const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: isWin });
if (build.status !== 0) process.exit(build.status ?? 1);

// 0.0.0.0 = reachable from the host phone and tablet on the venue Wi-Fi, not just this laptop.
const server = spawn("npx", ["next", "start", "-p", PORT, "-H", "0.0.0.0"], { stdio: "inherit", shell: isWin });
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

async function openWhenReady() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(URL);
      const [cmd, args] = isWin
        ? ["cmd", ["/c", "start", "", URL]]
        : process.platform === "darwin"
          ? ["open", [URL]]
          : ["xdg-open", [URL]];
      spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
      const ips = lanAddresses();
      console.log(`\nQuiz is running (press Ctrl+C here to stop)`);
      console.log(`  This laptop:        ${URL}`);
      for (const ip of ips) {
        console.log(`  Host phone:         http://${ip}:${PORT}/host`);
        console.log(`  Computer & tablet:  http://${ip}:${PORT}/display`);
      }
      if (ips.length === 0) console.log("  (Not on a network yet: join the venue Wi-Fi to connect the phone and tablet.)");
      console.log("");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(`\nOpen ${URL} in your browser.\n`);
}
openWhenReady();
