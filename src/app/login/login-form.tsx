"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { Button, Card, Field, Input, Segmented } from "@/components/ui/primitives";
import { getSupabase } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.includes("@")) return setError("Enter a valid email address");
    if (password.length < (mode === "signup" ? 8 : 1)) return setError(mode === "signup" ? "Use at least 8 characters" : "Enter your password");
    setBusy("password");
    try {
      const supabase = getSupabase();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // full navigation so the proxy sees the new session cookie
         
        window.location.assign(nextPath());
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callback(), data: { full_name: name.trim() } },
      });
      if (error) throw error;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (data.session) window.location.assign("/");
      else setNotice("Check your inbox to confirm your email, then sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function magicLink() {
    setError(null);
    setNotice(null);
    if (!email.includes("@")) return setError("Enter your email first");
    setBusy("magic");
    const { error } = await getSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: callback(), shouldCreateUser: false } });
    setBusy(null);
    if (error) setError(error.message);
    else setNotice("We've emailed you a sign-in link.");
  }

  async function forgot() {
    setError(null);
    setNotice(null);
    if (!email.includes("@")) return setError("Enter your email first");
    setBusy("reset");
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings/security`,
    });
    setBusy(null);
    if (error) setError(error.message);
    else setNotice("Check your inbox for a password reset link.");
  }

  return (
    <Card className="p-5">
      <Segmented
        className="mb-5 w-full"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setNotice(null);
        }}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Create account" },
        ]}
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === "signup" ? (
          <Field label="Your name" htmlFor="name">
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <p role="alert" className="rounded-xl bg-negative-soft px-3 py-2 text-[13px] text-negative">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-positive-soft px-3 py-2 text-[13px] text-positive">{notice}</p> : null}
        <Button type="submit" size="lg" loading={busy === "password"}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
      {mode === "signin" ? (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={magicLink} loading={busy === "magic"}>
            <Mail className="h-4 w-4" /> Email me a link
          </Button>
          <Button variant="ghost" size="sm" onClick={forgot} loading={busy === "reset"}>
            Forgot password?
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-center text-[12px] text-ink-3">Your account starts with your default income and expense budget, ready to edit.</p>
      )}
    </Card>
  );
}
