import type { Metadata } from "next";
import { HouseholdView } from "@/components/household/household-view";

export const metadata: Metadata = { title: "Household" };

export default function HouseholdPage() {
  return <HouseholdView />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
