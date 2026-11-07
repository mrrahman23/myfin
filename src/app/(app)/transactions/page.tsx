import type { Metadata } from "next";
import { TransactionsView } from "@/components/transactions/transactions-view";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return <TransactionsView />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
