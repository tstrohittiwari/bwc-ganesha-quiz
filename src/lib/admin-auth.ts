// Server-side only. A single local admin password, stored as a salted scrypt hash in data/admin.json.
// Forgot it? Delete data/admin.json and the Admin page will ask you to set a new one.
//
// A correct password returns a signed, expiring token for one purpose:
// - "admin": short-lived; the Admin page keeps it only in memory, so every visit asks for the password.
// - "host": lasts a show day; the host phone keeps it so a refresh mid-show doesn't lock the controls.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const ADMIN_FILE = path.join(process.cwd(), "data", "admin.json");
export const MIN_PASSWORD_LENGTH = 4;

export type TokenPurpose = "admin" | "host";
const TOKEN_LIFETIME_MS: Record<TokenPurpose, number> = {
  admin: 2 * 60 * 60 * 1000,
  host: 14 * 60 * 60 * 1000,
};

interface AdminFile {
  salt: string;
  hash: string;
  secret: string; // signs tokens; regenerated whenever the password is set
}

async function readAdminFile(): Promise<AdminFile | null> {
  try {
    return JSON.parse(await fs.readFile(ADMIN_FILE, "utf8")) as AdminFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function sign(secret: string, purpose: TokenPurpose, expires: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${expires}`).digest("hex");
}

export async function isPasswordSet(): Promise<boolean> {
  return (await readAdminFile()) !== null;
}

/** First-time setup only: refuses to overwrite an existing password. */
export async function setPassword(password: string): Promise<boolean> {
  if (await readAdminFile()) return false;
  const salt = randomBytes(16).toString("hex");
  const file: AdminFile = { salt, hash: hashPassword(password, salt), secret: randomBytes(32).toString("hex") };
  await fs.writeFile(ADMIN_FILE, JSON.stringify(file, null, 2), { encoding: "utf8", flag: "wx" });
  return true;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const file = await readAdminFile();
  return !!file && safeEqual(hashPassword(password, file.salt), file.hash);
}

export async function issueToken(purpose: TokenPurpose = "admin"): Promise<string> {
  const file = await readAdminFile();
  if (!file) throw new Error("Admin password is not set.");
  const expires = String(Date.now() + TOKEN_LIFETIME_MS[purpose]);
  return `${expires}.${sign(file.secret, purpose, expires)}`;
}

export async function isValidToken(token: string | null | undefined, purpose: TokenPurpose): Promise<boolean> {
  const file = await readAdminFile();
  const [expires, signature] = (token ?? "").split(".");
  if (!file || !expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(file.secret, purpose, expires));
}

function bearer(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

/** True when the request carries a valid, unexpired `Authorization: Bearer <admin token>`. */
export function isAdminRequest(request: Request): Promise<boolean> {
  return isValidToken(bearer(request), "admin");
}

export function isHostRequest(request: Request): Promise<boolean> {
  return isValidToken(bearer(request), "host");
}
