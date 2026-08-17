"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Save, Lock } from "lucide-react";
import { clsx } from "clsx";
import { supabase } from "@/lib/supabase";
import StatusBadge from "@/components/StatusBadge";
import type { Coiffeur, CoiffeurStatut, Ticket } from "@/types/database";

export default function DashboardAdmin() {
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreurLogin, setErreurLogin] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) =>
      setSession(!!sess)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogin() {
    setErreurLogin(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
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
            <h1 className="font-display text-lg">Espace Admin — Akim</h1>
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
          />
          {erreurLogin && <p className="mb-2 text-sm text-red-500">{erreurLogin}</p>}
          <button
            onClick={handleLogin}
            className="w-full rounded-lg bg-brand-500 py-2 font-semibold text-white hover:bg-brand-600"
          >
            Se connecter
          </button>
        </div>
      </main>
    );
  }

  return <AdminContenu />;
}

function AdminContenu() {
  const [coiffeurs, setCoiffeurs] = useState<Coiffeur[]>([]);
  const [ticketsJour, setTicketsJour] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouvelleSpecialite, setNouvelleSpecialite] = useState("");

  async function fetchTout() {
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);

    const [{ data: coif }, { data: tix }] = await Promise.all([
      supabase.from("coiffeurs").select("*").order("ordre_affichage"),
      supabase
        .from("tickets")
        .select("*, coiffeur:coiffeurs(*), service:services(*)")
        .gte("created_at", debutJour.toISOString())
        .order("created_at", { ascending: false }),
    ]);
    setCoiffeurs((coif ?? []) as Coiffeur[]);
    setTicketsJour((tix ?? []) as Ticket[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchTout();
    const channel = supabase
      .channel("admin-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, fetchTout)
      .on("postgres_changes", { event: "*", schema: "public", table: "coiffeurs" }, fetchTout)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function changerStatut(id: string, statut: CoiffeurStatut) {
    await supabase.from("coiffeurs").update({ statut }).eq("id", id);
  }

  async function ajouterCoiffeur() {
    if (!nouveauNom.trim()) return;
    await supabase.from("coiffeurs").insert({
      nom: nouveauNom.trim(),
      specialite: nouvelleSpecialite.trim() || null,
      statut: "actif",
      ordre_affichage: coiffeurs.length,
    });
    setNouveauNom("");
    setNouvelleSpecialite("");
  }

  async function supprimerCoiffeur(id: string) {
    if (!confirm("Supprimer ce coiffeur ?")) return;
    await supabase.from("coiffeurs").delete().eq("id", id);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const enAttente = ticketsJour.filter((t) => t.statut === "en_attente").length;
  const enCours = ticketsJour.filter((t) => t.statut === "en_cours").length;
  const termines = ticketsJour.filter((t) => t.statut === "termine").length;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <header className="mx-auto mb-8 max-w-4xl">
        <h1 className="font-display text-2xl">Tableau de bord — Akim</h1>
        <p className="text-sm text-gray-500">Vue d&apos;ensemble du salon DS CUT</p>
      </header>

      {/* Statistiques */}
      <section className="mx-auto mb-8 grid max-w-4xl grid-cols-3 gap-3">
        <Stat label="En attente" valeur={enAttente} />
        <Stat label="En cours" valeur={enCours} />
        <Stat label="Terminés" valeur={termines} />
      </section>

      {/* Gestion coiffeurs */}
      <section className="mx-auto mb-8 max-w-4xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-display text-lg">Coiffeurs</h2>

        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={nouveauNom}
            onChange={(e) => setNouveauNom(e.target.value)}
            placeholder="Nom du coiffeur"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
          />
          <input
            value={nouvelleSpecialite}
            onChange={(e) => setNouvelleSpecialite(e.target.value)}
            placeholder="Spécialité (optionnel)"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
          />
          <button
            onClick={ajouterCoiffeur}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>

        <div className="space-y-2">
          {coiffeurs.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 p-3"
            >
              <div>
                <p className="font-semibold">{c.nom}</p>
                {c.specialite && <p className="text-xs text-gray-400">{c.specialite}</p>}
              </div>
              <div className="flex items-center gap-2">
                {(["actif", "inactif", "jour_off"] as CoiffeurStatut[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => changerStatut(c.id, s)}
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      c.statut === s
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {s === "actif" ? "Actif" : s === "inactif" ? "Indisponible" : "Jour off"}
                  </button>
                ))}
                <button
                  onClick={() => supprimerCoiffeur(c.id)}
                  className="rounded-lg bg-red-50 p-2 text-red-500 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* File du jour */}
      <section className="mx-auto max-w-4xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-display text-lg">File d&apos;attente du jour</h2>
        <div className="space-y-2">
          {ticketsJour.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{t.client_nom}</p>
                <p className="text-xs text-gray-400">
                  {t.coiffeur?.nom} · {t.service?.nom}
                </p>
              </div>
              <StatusBadge statut={t.statut} />
            </div>
          ))}
          {ticketsJour.length === 0 && (
            <p className="text-center text-sm text-gray-400">Aucun ticket aujourd&apos;hui.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
      <p className="font-display text-2xl text-brand-600">{valeur}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
