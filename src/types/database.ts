export type CoiffeurStatut = "actif" | "inactif" | "jour_off";

export interface Coiffeur {
  id: string;
  user_id: string | null;
  nom: string;
  specialite: string | null;
  avatar_url: string | null;
  statut: CoiffeurStatut;
  ordre_affichage: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  duree_minutes: number;
  actif: boolean;
  created_at: string;
}

export type TicketStatut =
  | "en_attente"
  | "en_cours"
  | "termine"
  | "en_retard"
  | "annule";

export type PaiementMode = "sur_place" | "transfert";

export interface Ticket {
  id: string;
  code: string;
  client_nom: string;
  client_telephone: string;
  coiffeur_id: string;
  service_id: string;
  statut: TicketStatut;
  rang: number;
  heure_estimee: string;
  retard_minutes: number;
  paiement_mode: PaiementMode;
  paiement_valide: boolean;
  created_at: string;
  updated_at: string;
  // relations optionnelles (jointures)
  coiffeur?: Coiffeur;
  service?: Service;
}

export type UserRole = "admin" | "coiffeur";

export interface AppUser {
  id: string;
  auth_id: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      coiffeurs: { Row: Coiffeur; Insert: Partial<Coiffeur>; Update: Partial<Coiffeur> };
      services: { Row: Service; Insert: Partial<Service>; Update: Partial<Service> };
      tickets: { Row: Ticket; Insert: Partial<Ticket>; Update: Partial<Ticket> };
      users: { Row: AppUser; Insert: Partial<AppUser>; Update: Partial<AppUser> };
    };
  };
}
