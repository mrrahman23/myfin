import type { Metadata } from "next";
import { InstallSettings } from "@/components/settings/settings-pages";

export const metadata: Metadata = { title: "Install" };

export default function Page() {
  return <InstallSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
