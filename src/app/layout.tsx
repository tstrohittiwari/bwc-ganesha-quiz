import type { Metadata } from "next";
// Poppins is bundled locally (Latin + Devanagari), so the app never needs the internet for fonts.
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BWC Ganesha Quiz",
  description: "Host console for the BWC Ganesha Quiz",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
