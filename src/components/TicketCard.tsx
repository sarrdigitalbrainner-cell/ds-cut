"use client";

import QRCode from "react-qr-code";
import { Scissors, Clock, User } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { Ticket } from "@/types/database";

const NUMERO_SALON = "776729740";

export default function TicketCard({ ticket }: { ticket: Ticket }) {
  const heure = new Date(ticket.heure_estimee).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-xl">
      <div className="bg-ink px-6 py-4 text-center text-white">
        <p className="font-display text-lg tracking-wide">DS CUT</p>
        <p className="text-xs text-brand-200">Ticket digital de la file d&apos;attente</p>
      </div>

      <div className="flex flex-col items-center gap-3 px-6 py-6">
        <div className="rounded-xl border border-brand-100 p-3">
          <QRCode value={ticket.code} size={140} />
        </div>
        <p className="font-mono text-sm text-gray-500">{ticket.code}</p>

        <div className="mt-2 flex w-full items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
          <span className="text-sm text-gray-500">Rang dans la file</span>
          <span className="font-display text-2xl text-brand-600">#{ticket.rang}</span>
        </div>

        <div className="w-full space-y-2 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-brand-500" />
            <span>{ticket.coiffeur?.nom ?? "Coiffeur"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-500" />
            <span>Passage estimé vers {heure}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-brand-500" />
            <span>{ticket.client_nom}</span>
          </div>
        </div>

        <div className="mt-2">
          <StatusBadge statut={ticket.statut} />
        </div>

        <div className="mt-4 w-full rounded-lg border border-dashed border-brand-200 bg-brand-50/60 p-3 text-center text-xs text-gray-600">
          <p className="font-semibold text-brand-700">Paiement</p>
          <p>
            Sur place, ou par transfert / appel au{" "}
            <a href={`tel:${NUMERO_SALON}`} className="font-semibold text-brand-600 underline">
              {NUMERO_SALON}
            </a>{" "}
            pour valider votre place à l&apos;avance.
          </p>
        </div>
      </div>
    </div>
  );
}
