import type { Metadata } from "next";
import { HouseholdSettings } from "@/components/settings/household-settings";

export const metadata: Metadata = { title: "Household" };

export default function Page() {
  return <HouseholdSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
