import type { Metadata } from "next";
import { RemindersView } from "@/components/overview/reminders-view";

export const metadata: Metadata = { title: "Reminders" };

export default function RemindersPage() {
  return <RemindersView />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
