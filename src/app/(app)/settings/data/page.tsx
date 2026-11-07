import type { Metadata } from "next";
import { DataSettings } from "@/components/settings/settings-pages";

export const metadata: Metadata = { title: "Data" };

export default function Page() {
  return <DataSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
