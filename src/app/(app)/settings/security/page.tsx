import type { Metadata } from "next";
import { SecuritySettings } from "@/components/settings/settings-pages";

export const metadata: Metadata = { title: "Sign-in & security" };

export default function Page() {
  return <SecuritySettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
