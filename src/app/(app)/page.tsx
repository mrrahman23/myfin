import { OverviewView } from "@/components/overview/overview-view";

export default function OverviewPage() {
  return <OverviewView />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
