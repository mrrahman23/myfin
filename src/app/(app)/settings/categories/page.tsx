import type { Metadata } from "next";
import { CategoriesSettings } from "@/components/settings/categories-settings";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return <CategoriesSettings />;
}

/** Client-rendered behind auth; opt out of instant-navigation validation. */
export const instant = false;
