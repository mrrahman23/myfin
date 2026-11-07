import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="mb-4 h-16 w-16 rounded-[18px] shadow-float" />
          <h1 className="text-[28px] font-bold tracking-[-0.03em]">myFin</h1>
          <p className="mt-1 text-[15px] text-ink-3">Your money, at a glance.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
