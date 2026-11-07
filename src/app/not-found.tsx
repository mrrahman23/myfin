import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">Page not found</h1>
        <Link href="/" className="mt-4 inline-block text-[15px] font-semibold text-accent">
          Back to overview
        </Link>
      </div>
    </main>
  );
}
