"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, CheckCircle2, AlarmClock, Phone, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getFileCoiffeur,
  demarrerTicket,
  terminerTicket,
  signalerRetard,
} from "@/lib/queue";
import StatusBadge from "@/components/StatusBadge";
import type { Coiffeur, Ticket } from "@/types/database";

/**
 * Récupère la fiche `coiffeurs` reliée au compte Supabase Auth actuellement
 * connecté (via users.auth_id -> users.id -> coiffeurs.user_id).
 */
async function getCoiffeurConnecte(): Promise<Coiffeur | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("coiffeurs")
    .select("*, user:users(*)")
    .eq("user.auth_id", user.id)
    .single();

  return (data as Coiffeur) ?? null;
}

/**
 * Page /coiffeur : entièrement verrouillée derrière un écran de connexion.
 * Aucune donnée de la file n'est chargée ni affichée tant que
 * l'utilisateur n'est pas authentifié via Supabase Auth.
 */
export default function DashboardCoiffeurPage() {
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreurLogin, setErreurLogin] = useState<string | null>(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) =>
      setSession(!!sess)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogin() {
    setErreurLogin(null);
    setConnexionEnCours(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    setConnexionEnCours(false);
    if (error) setErreurLogin("Identifiants incorrects.");
  }

  if (session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand-500" />
            <h1 className="font-display text-lg">Espace Coiffeur</h1>
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="mb-2 w-full rounded-lg border border-gray-200 px-4 py-2"
          />
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="Mot de passe"
            className="mb-3 w-full rounded-lg border border-gray-200 px-4 py-2"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          {erreurLogin && <p className="mb-2 text-sm text-red-500">{erreurLogin}</p>}
          <button
            onClick={handleLogin}
            disabled={connexionEnCours}
            className="w-full rounded-lg bg-brand-500 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {connexionEnCours ? "Connexion..." : "Se connecter"}
          </button>
        </div>
      </main>
    );
  }

  return <FileDuCoiffeur />;
}

function FileDuCoiffeur() {
  const [coiffeur, setCoiffeur] = useState<Coiffeur | null>(null);
  const [file, setFile] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  const refresh = useCallback(async (coiffeurId: string) => {
    const data = await getFileCoiffeur(coiffeurId);
    setFile(data);
  }, []);

  useEffect(() => {
    (async () => {
      const c = await getCoiffeurConnecte();
      setCoiffeur(c);
      if (c) await refresh(c.id);
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    if (!coiffeur) return;
    const channel = supabase
      .channel(`file-coiffeur-${coiffeur.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `coiffeur_id=eq.${coiffeur.id}`,
        },
        () => refresh(coiffeur.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [coiffeur, refresh]);

  async function withAction(id: string, fn: () => Promise<void>) {
    setActionEnCours(id);
    try {
      await fn();
      if (coiffeur) await refresh(coiffeur.id);
    } finally {
      setActionEnCours(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!coiffeur) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center text-gray-500">
        <p>
          Ce compte est connecté mais n&apos;est relié à aucune fiche coiffeur.
          Contactez Akim pour faire le lien.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  const ticketEnCours = file.find((t) => t.statut === "en_cours");

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <header className="mx-auto mb-6 flex max-w-2xl items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">Bonjour,</p>
          <h1 className="font-display text-2xl">{coiffeur.nom}</h1>
          <p className="text-sm text-gray-500">{file.length} client(s) dans votre file</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-500 shadow-sm hover:bg-gray-100"
        >
          Déconnexion
        </button>
      </header>

      <section className="mx-auto max-w-2xl space-y-3">
        {file.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-gray-400">
            Aucun client en attente pour le moment.
          </p>
        )}

        {file.map((t, idx) => {
          const estActionnable =
            !ticketEnCours || ticketEnCours.id === t.id || idx === 0;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-xs text-gray-400">Rang #{t.rang}</p>
                <p className="font-semibold">{t.client_nom}</p>
                <p className="text-sm text-gray-500">{t.service?.nom}</p>
                <a
                  href={`tel:${t.client_telephone}`}
                  className="mt-1 flex items-center gap-1 text-xs text-brand-600"
                >
                  <Phone className="h-3 w-3" /> {t.client_telephone}
                </a>
                {t.retard_minutes > 0 && (
                  <p className="mt-1 text-xs text-red-500">
                    Retard signalé : {t.retard_minutes} min
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <StatusBadge statut={t.statut} />
                <div className="flex gap-2">
                  {t.statut !== "en_cours" && t.statut !== "termine" && (
                    <button
                      disabled={!!actionEnCours || !!ticketEnCours}
                      onClick={() => withAction(t.id, () => demarrerTicket(t.id))}
                      title={
                        ticketEnCours
                          ? "Terminez le client en cours avant d'en démarrer un autre"
                          : "Démarrer"
                      }
                      className="rounded-lg bg-brand-500 p-2 text-white disabled:opacity-30"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  {t.statut === "en_cours" && (
                    <button
                      disabled={!!actionEnCours}
                      onClick={() => withAction(t.id, () => terminerTicket(t.id))}
                      className="rounded-lg bg-green-600 p-2 text-white disabled:opacity-30"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  {t.statut === "en_attente" && (
                    <button
                      disabled={!!actionEnCours}
                      onClick={() => withAction(t.id, () => signalerRetard(t.id))}
                      className="rounded-lg bg-red-100 p-2 text-red-600 disabled:opacity-30"
                    >
                      <AlarmClock className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
