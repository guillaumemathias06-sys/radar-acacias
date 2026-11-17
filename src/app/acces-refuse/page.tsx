"use client";

import { createClient } from "@/lib/supabase/client";

export default function AccessDenied() {
  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm rounded-xl border border-border bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">Accès non autorisé</h1>
        <p className="mt-2 text-sm text-muted">Ce compte n&apos;est pas rattaché à l&apos;équipe du club. Demande à un administrateur de t&apos;ajouter.</p>
        <button onClick={signOut} className="mt-6 rounded-md border border-border px-3 py-2 text-sm hover:bg-background">
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
