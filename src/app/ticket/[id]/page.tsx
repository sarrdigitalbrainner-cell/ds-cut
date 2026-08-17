"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlarmClock } from "lucide-react";
import TicketCard from "@/components/TicketCard";
import { getTicketParId, declarerRetardClient } from "@/lib/queue";
import type { Ticket } from "@/types/database";

// Intervalle de rafraîchissement du statut du ticket (ms).
const INTERVALLE_RAFRAICHISSEMENT = 6000;

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [minutesRetard, setMinutesRetard] = useState(10);
  const [envoiRetard, setEnvoiRetard] = useState(false);

  async function fetchTicket() {
    try {
      const data = await getTicketParId(id);
      setTicket(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTicket();
    // La table `tickets` n'étant plus accessible en lecture directe pour
    // un visiteur anonyme (voir schema.sql), le suivi "temps réel" via
    // Supabase Realtime n'est plus possible ici. On rafraîchit donc le
    // statut du ticket par sondage périodique via la fonction RPC
    // `get_ticket_by_id`, qui ne renvoie que ce ticket précis.
    const interval = setInterval(fetchTicket, INTERVALLE_RAFRAICHISSEMENT);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSignalerRetard() {
    if (!ticket) return;
    setEnvoiRetard(true);
    try {
      await declarerRetardClient(ticket.id, minutesRetard);
      await fetchTicket();
    } finally {
      setEnvoiRetard(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Ticket introuvable.
      </div>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <TicketCard ticket={ticket} />

      {ticket.statut === "en_attente" && (
        <div className="mx-auto mt-6 w-full max-w-sm rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-gray-700">
            <AlarmClock className="h-4 w-4 text-brand-500" />
            Un imprévu ? Signalez votre retard
          </p>
          <div className="mt-3 flex items-center gap-3">
            <select
              value={minutesRetard}
              onChange={(e) => setMinutesRetard(Number(e.target.value))}
              className="rounded-lg border border-gray-200 px-3 py-2"
            >
              {[5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <button
              onClick={handleSignalerRetard}
              disabled={envoiRetard}
              className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {envoiRetard ? "Envoi..." : "Je serai en retard"}
            </button>
          </div>
          {ticket.retard_minutes > 0 && (
            <p className="mt-2 text-xs text-brand-600">
              Retard signalé : {ticket.retard_minutes} min. Votre coiffeur a été informé.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
