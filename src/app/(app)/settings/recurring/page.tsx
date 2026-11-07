import type { Metadata } from "next";
import { RecurringSettings } from "@/components/settings/recurring-settings";

export const metadata: Metadata = { title: "Recurring items" };

export default function Page() {
  return <RecurringSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
