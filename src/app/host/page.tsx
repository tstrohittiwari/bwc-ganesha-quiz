import type { Metadata } from "next";
import LiveHost from "@/components/LiveHost";

export const metadata: Metadata = { title: "BWC Ganesha Quiz · Host" };

export default function HostPage() {
  return <LiveHost />;
}
