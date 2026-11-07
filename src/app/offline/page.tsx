import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">You&apos;re offline</h1>
        <p className="mt-2 text-[15px] text-ink-3">myFin needs a connection to load your latest figures. They&apos;ll appear as soon as you&apos;re back online.</p>
      </div>
    </main>
  );
}
