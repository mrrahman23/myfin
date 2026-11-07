import type { Metadata } from "next";

export const metadata: Metadata = { title: "Setup required" };

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-[28px] font-bold tracking-[-0.03em]">Connect Supabase</h1>
      <p className="mt-2 text-[15px] text-ink-2">myFin needs a Supabase project for authentication and your data.</p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-ink-2">
        <li>Create a project at supabase.com.</li>
        <li>
          Run <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[13px]">supabase/migrations/20261107000000_init.sql</code> in the SQL editor (or{" "}
          <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[13px]">supabase db push</code>).
        </li>
        <li>
          Copy <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[13px]">.env.example</code> to{" "}
          <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[13px]">.env.local</code> and fill in the project URL and publishable key.
        </li>
        <li>Restart the dev server.</li>
      </ol>
      <p className="mt-6 text-[13px] text-ink-3">See README.md for full instructions.</p>
    </main>
  );
}
