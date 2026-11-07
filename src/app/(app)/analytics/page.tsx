import type { Metadata } from "next";
import { AnalyticsView } from "@/components/charts/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return <AnalyticsView />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
