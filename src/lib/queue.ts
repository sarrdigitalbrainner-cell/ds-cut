import { supabase } from "./supabase";
import type { Ticket } from "@/types/database";

/**
 * Nombre de positions dont un ticket "en retard" est rétrogradé
 * dans la file de son coiffeur.
 */
export const RETARD_DECALAGE = 2;

/**
 * Crée un ticket pour un client (espace public, non authentifié).
 *
 * Passe par la fonction RPC `create_ticket` (SECURITY DEFINER) plutôt
 * que par un insert direct sur la table `tickets` : le rang, le code
 * et l'heure estimée sont calculés côté serveur, et la table `tickets`
 * reste totalement fermée en lecture/écriture directe à la clé anonyme.
 */
export async function creerTicket(params: {
  clientNom: string;
  clientTelephone: string;
  coiffeurId: string;
  serviceId: string;
}): Promise<Ticket> {
  const { data, error } = await supabase.rpc("create_ticket", {
    p_client_nom: params.clientNom,
    p_client_telephone: params.clientTelephone,
    p_coiffeur_id: params.coiffeurId,
    p_service_id: params.serviceId,
  });
  if (error) throw error;
  return data as unknown as Ticket;
}

/**
 * Récupère un ticket précis par son UUID (espace public, non
 * authentifié), via la fonction RPC `get_ticket_by_id`. Ne permet
 * jamais de lister ou filtrer les tickets : il faut connaître
 * l'UUID exact du ticket (transmis uniquement au client concerné).
 */
export async function getTicketParId(ticketId: string): Promise<Ticket | null> {
  const { data, error } = await supabase.rpc("get_ticket_by_id", {
    p_ticket_id: ticketId,
  });
  if (error) throw error;
  return (data as unknown as Ticket) ?? null;
}

/**
 * Le client déclare lui-même un retard estimé (en minutes) depuis
 * l'espace public, via la fonction RPC `declare_retard_client`
 * (aucun accès direct en écriture à la table pour l'anonyme).
 */
export async function declarerRetardClient(ticketId: string, minutes: number) {
  const { error } = await supabase.rpc("declare_retard_client", {
    p_ticket_id: ticketId,
    p_minutes: minutes,
  });
  if (error) throw error;
}

/**
 * Récupère la file active (non terminée / non annulée) d'un coiffeur,
 * triée par rang croissant. Réservé aux dashboards authentifiés
 * (coiffeur / admin) — couvert par la policy RLS `auth_read_tickets`.
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
