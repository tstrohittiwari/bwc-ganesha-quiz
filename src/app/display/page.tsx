import type { Metadata } from "next";
import LiveDisplay from "@/components/LiveDisplay";

export const metadata: Metadata = { title: "BWC Ganesha Quiz · Display" };

export default function DisplayPage() {
  return <LiveDisplay />;
}
