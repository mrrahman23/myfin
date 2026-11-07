import type { Metadata } from "next";
import { BudgetView } from "@/components/budget/budget-view";

export const metadata: Metadata = { title: "Monthly Budget" };

export default function BudgetPage() {
  return <BudgetView />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
