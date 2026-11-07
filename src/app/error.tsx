"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-[14px] text-ink-3">{error.message}</p>
        <button type="button" onClick={reset} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-inverse">
          Try again
        </button>
      </div>
    </main>
  );
}
