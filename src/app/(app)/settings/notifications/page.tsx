import type { Metadata } from "next";
import { NotificationSettings } from "@/components/settings/settings-pages";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <NotificationSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
