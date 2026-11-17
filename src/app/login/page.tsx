"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Connexion uniquement : outil interne, les comptes sont créés depuis
// Supabase et rattachés à l'équipe (table team_members).
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : error.message);
      return;
    }
    // Navigation complète : le cookie de session doit partir avec une vraie requête serveur.
    window.location.href = "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Radar</h1>
        <p className="mt-1 text-sm text-muted">Acquisition & prospection — TC Acacias</p>
        <div className="mt-6 flex flex-col gap-3">
          <input type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
          <input type="password" required placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
          {error && <p className="rounded-md bg-critical-soft px-3 py-2 text-xs text-critical">{error}</p>}
          <button type="submit" disabled={loading} className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </form>
    </main>
  );
}
