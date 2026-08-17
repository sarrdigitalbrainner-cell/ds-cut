import { supabase } from "./supabase";
import type { Ticket } from "@/types/database";

/**
 * Nombre de positions dont un ticket "en retard" est rétrogradé
 * dans la file de son coiffeur.
 */
export const RETARD_DECALAGE = 2;

/**
 * Génère un code court unique pour un ticket (ex: DSC-4F8A2).
 */
export function generateTicketCode(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `DSC-${rand}`;
}

/**
 * Récupère la file active (non terminée / non annulée) d'un coiffeur,
 * triée par rang croissant.
 */
export async function getFileCoiffeur(coiffeurId: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*, service:services(*), coiffeur:coiffeurs(*)")
    .eq("coiffeur_id", coiffeurId)
    .in("statut", ["en_attente", "en_cours", "en_retard"])
    .order("rang", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Ticket[];
}

/**
 * Calcule le prochain rang disponible pour un nouveau ticket
 * dans la file d'un coiffeur donné.
 */
export async function getProchainRang(coiffeurId: string): Promise<number> {
  const file = await getFileCoiffeur(coiffeurId);
  if (file.length === 0) return 1;
  return Math.max(...file.map((t) => t.rang)) + 1;
}

/**
 * Passe un ticket en "en_cours". Aucun autre ticket du même coiffeur
 * ne devrait être en_cours en simultané (UI + policy le garantissent).
 */
export async function demarrerTicket(ticketId: string) {
  const { error } = await supabase
    .from("tickets")
    .update({ statut: "en_cours" })
    .eq("id", ticketId);
  if (error) throw error;
}

/**
 * Termine un ticket : le retire de la file active. Le rang des tickets
 * suivants n'a pas besoin d'être recalculé car le tri se fait par rang
 * croissant parmi les tickets encore actifs.
 */
export async function terminerTicket(ticketId: string) {
  const { error } = await supabase
    .from("tickets")
    .update({ statut: "termine" })
    .eq("id", ticketId);
  if (error) throw error;
}

/**
 * Marque un ticket comme "en retard" et le décale de RETARD_DECALAGE
 * positions dans la file de son coiffeur, sans jamais dépasser le
 * dernier rang (le client garde son ticket, il ne le perd pas).
 *
 * Principe : on échange son rang avec celui du ticket situé
 * `RETARD_DECALAGE` positions plus loin dans la file (s'il existe),
 * ce qui fait avancer mécaniquement les clients déjà présents
 * sans bloquer personne.
 */
export async function signalerRetard(ticketId: string) {
  const { data: ticket, error: e1 } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .single();
  if (e1 || !ticket) throw e1 ?? new Error("Ticket introuvable");

  const file = await getFileCoiffeur(ticket.coiffeur_id);
  const index = file.findIndex((t) => t.id === ticketId);
  if (index === -1) throw new Error("Ticket non trouvé dans la file active");

  const nouvelIndex = Math.min(index + RETARD_DECALAGE, file.length - 1);
  if (nouvelIndex === index) {
    // Déjà en fin de file : on marque juste le statut
    const { error } = await supabase
      .from("tickets")
      .update({ statut: "en_retard" })
      .eq("id", ticketId);
    if (error) throw error;
    return;
  }

  // On retire le ticket retardé de sa position et on le réinsère
  // `RETARD_DECALAGE` places plus loin, en décalant les autres d'un cran.
  const fileSansTicket = file.filter((t) => t.id !== ticketId);
  fileSansTicket.splice(nouvelIndex, 0, { ...ticket, statut: "en_retard" });

  // Ré-attribution des rangs 1..N dans le nouvel ordre
  const updates = fileSansTicket.map((t, i) =>
    supabase
      .from("tickets")
      .update({
        rang: i + 1,
        statut: t.id === ticketId ? "en_retard" : t.statut,
      })
      .eq("id", t.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Le client déclare lui-même un retard estimé (en minutes) depuis
 * l'espace public, sans changer son rang — informe juste le coiffeur.
 */
export async function declarerRetardClient(ticketId: string, minutes: number) {
  const { error } = await supabase
    .from("tickets")
    .update({ retard_minutes: minutes })
    .eq("id", ticketId);
  if (error) throw error;
}
