import { clsx } from "clsx";
import type { TicketStatut } from "@/types/database";

const CONFIG: Record<TicketStatut, { label: string; className: string }> = {
  en_attente: { label: "En attente", className: "bg-brand-100 text-brand-700" },
  en_cours: { label: "En cours", className: "bg-green-100 text-green-700 animate-pulseSlow" },
  termine: { label: "Terminé", className: "bg-gray-200 text-gray-600" },
  en_retard: { label: "En retard", className: "bg-red-100 text-red-700" },
  annule: { label: "Annulé", className: "bg-gray-200 text-gray-500 line-through" },
};

export default function StatusBadge({ statut }: { statut: TicketStatut }) {
  const cfg = CONFIG[statut];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  );
}
