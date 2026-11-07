import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/settings-pages";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return <ProfileSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
