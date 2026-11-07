import type { Metadata } from "next";
import { SettingsHome } from "@/components/settings/settings-home";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsHome />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
