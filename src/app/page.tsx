"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Scissors, Phone, CheckCircle2, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { supabase } from "@/lib/supabase";
import { creerTicket } from "@/lib/queue";
import type { Coiffeur, Service } from "@/types/database";

const NUMERO_SALON = "776729740";

type Etape = "services" | "coiffeur" | "infos" | "envoi";

export default function HomePage() {
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [coiffeurs, setCoiffeurs] = useState<Coiffeur[]>([]);
  const [loading, setLoading] = useState(true);

  const [etape, setEtape] = useState<Etape>("services");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [coiffeurId, setCoiffeurId] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const refCoiffeur = useRef<HTMLDivElement>(null);
  const refInfos = useRef<HTMLDivElement>(null);

  // Fait défiler automatiquement vers la nouvelle étape : sans ça, sur
  // mobile, l'étape suivante peut apparaître au-dessus du point de scroll
  // actuel (hors écran) et donner l'impression que rien ne s'est passé.
  useEffect(() => {
    const cible = etape === "coiffeur" ? refCoiffeur.current : etape === "infos" ? refInfos.current : null;
    if (cible) {
      cible.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [etape]);

  useEffect(() => {
    async function fetchData() {
      const [
        { data: srv, error: erreurServices },
        { data: coif, error: erreurCoiffeurs },
      ] = await Promise.all([
        supabase.from("services").select("*").eq("actif", true).order("prix"),
        supabase
          .from("coiffeurs")
          .select("*")
          .order("ordre_affichage", { ascending: true }),
      ]);

      if (erreurServices) {
        console.error("Erreur chargement services:", erreurServices);
      }
      if (erreurCoiffeurs) {
        console.error("Erreur chargement coiffeurs:", erreurCoiffeurs);
      }
      if (erreurServices || erreurCoiffeurs) {
        setErreurChargement(
          "Impossible de charger les données du salon. Vérifiez votre connexion ou réessayez plus tard."
        );
      }

      setServices((srv ?? []) as Service[]);
      setCoiffeurs((coif ?? []) as Coiffeur[]);
      setLoading(false);
    }
    fetchData();
  }, []);

  async function handleValiderTicket() {
    setErreur(null);
    if (!serviceId || !coiffeurId || !nom.trim() || !telephone.trim()) {
      setErreur("Merci de compléter toutes les informations.");
      return;
    }
    setEtape("envoi");

    try {
      const ticket = await creerTicket({
        clientNom: nom,
        clientTelephone: telephone,
        coiffeurId,
        serviceId,
      });
      router.push(`/ticket/${ticket.id}`);
    } catch (e) {
      setErreur("Une erreur est survenue. Merci de réessayer.");
      setEtape("infos");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden bg-ink px-6 py-14 text-center text-white">
        <div className="barber-stripes" aria-hidden="true" />
        <div className="relative z-10">
          <p className="font-display text-4xl tracking-wide text-brand-300">DS CUT</p>
          <p className="mt-2 text-sm text-gray-300">
            Salon de coiffure — Réservation en direct
          </p>
          <a
            href={`tel:${NUMERO_SALON}`}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white"
          >
            <Phone className="h-4 w-4" /> {NUMERO_SALON}
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 py-10">
        {erreurChargement && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {erreurChargement}
          </p>
        )}

        {/* ÉTAPE 1 : SERVICES */}
        <StepHeader active={etape === "services"} numero={1} titre="Choisissez votre service" />
        {etape === "services" && (
          <div className="mt-4 grid gap-3">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setServiceId(s.id);
                  setEtape("coiffeur");
                }}
                className="flex items-center justify-between rounded-xl border border-brand-100 bg-white px-5 py-4 text-left shadow-sm transition hover:border-brand-400"
              >
                <div>
                  <p className="font-semibold">{s.nom}</p>
                  {s.description && (
                    <p className="text-sm text-gray-500">{s.description}</p>
                  )}
                  <p className="text-xs text-gray-400">{s.duree_minutes} min</p>
                </div>
                <p className="font-display text-lg text-brand-600">{s.prix} FCFA</p>
              </button>
            ))}
          </div>
        )}

        {/* ÉTAPE 2 : COIFFEUR */}
        {etape !== "services" && (
          <div ref={refCoiffeur}>
            <StepHeader
              active={etape === "coiffeur"}
              numero={2}
              titre="Choisissez votre coiffeur"
            />
            {etape === "coiffeur" && (
              <>
                {coiffeurs.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-brand-200 bg-white px-5 py-6 text-center text-sm text-gray-500">
                    Aucun coiffeur disponible pour le moment. Appelez-nous au{" "}
                    <a href={`tel:${NUMERO_SALON}`} className="font-semibold text-brand-600">
                      {NUMERO_SALON}
                    </a>{" "}
                    pour réserver.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {coiffeurs.map((c) => {
                      const disponible = c.statut === "actif";
                      return (
                        <button
                          key={c.id}
                          disabled={!disponible}
                          onClick={() => {
                            setCoiffeurId(c.id);
                            setEtape("infos");
                          }}
                          className={clsx(
                            "flex flex-col items-center gap-2 rounded-xl border p-4 text-center shadow-sm transition",
                            disponible
                              ? "border-brand-100 bg-white hover:border-brand-400"
                              : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-50"
                          )}
                        >
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                            <Scissors className="h-6 w-6" />
                          </div>
                          <p className="text-sm font-semibold">{c.nom}</p>
                          {c.specialite && (
                            <p className="text-xs text-gray-400">{c.specialite}</p>
                          )}
                          <p
                            className={clsx(
                              "text-xs font-medium",
                              disponible ? "text-green-600" : "text-red-500"
                            )}
                          >
                            {disponible
                              ? "Disponible"
                              : c.statut === "jour_off"
                              ? "Jour off"
                              : "Indisponible"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ÉTAPE 3 : INFOS CLIENT */}
        {(etape === "infos" || etape === "envoi") && (
          <div ref={refInfos}>
            <StepHeader active={etape === "infos"} numero={3} titre="Vos informations" />
            <div className="mt-4 space-y-3 rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
              <div>
                <label className="text-sm font-medium text-gray-600">Nom complet</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-brand-400"
                  placeholder="Ex: Moussa Diop"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">
                  Numéro de téléphone
                </label>
                <input
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-brand-400"
                  placeholder="Ex: 77 000 00 00"
                />
              </div>

              {erreur && <p className="text-sm text-red-500">{erreur}</p>}

              <button
                onClick={handleValiderTicket}
                disabled={etape === "envoi"}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                {etape === "envoi" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Obtenir mon ticket
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function StepHeader({
  active,
  numero,
  titre,
}: {
  active: boolean;
  numero: number;
  titre: string;
}) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <div
        className={clsx(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
          active ? "bg-brand-500 text-white" : "bg-brand-100 text-brand-600"
        )}
      >
        {numero}
      </div>
      <h2 className="font-display text-lg">{titre}</h2>
    </div>
  );
}
