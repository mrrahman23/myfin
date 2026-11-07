import type { Metadata } from "next";
import { PreferenceSettings } from "@/components/settings/settings-pages";

export const metadata: Metadata = { title: "Preferences" };

export default function Page() {
  return <PreferenceSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
