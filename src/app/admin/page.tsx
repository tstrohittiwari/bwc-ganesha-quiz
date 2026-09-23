import { connection } from "next/server";
import AdminPanel from "@/components/AdminPanel";
import { MIN_PASSWORD_LENGTH, isPasswordSet } from "@/lib/admin-auth";

export default async function AdminPage() {
  await connection(); // whether a password exists can change at runtime, so never prerender this page
  return <AdminPanel firstTime={!(await isPasswordSet())} minLength={MIN_PASSWORD_LENGTH} />;
}
