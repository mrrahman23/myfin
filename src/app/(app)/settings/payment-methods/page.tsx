import type { Metadata } from "next";
import { PaymentMethodsSettings } from "@/components/settings/payment-methods-settings";

export const metadata: Metadata = { title: "Payment methods" };

export default function Page() {
  return <PaymentMethodsSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
