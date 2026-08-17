-- ============================================================
-- DS CUT — Schéma de base de données Supabase (PostgreSQL)
-- ============================================================

-- Extension pour UUID
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- Table: users (comptes internes : admin + coiffeurs)
-- ------------------------------------------------------------
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'coiffeur')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Table: coiffeurs
-- ------------------------------------------------------------
create table if not exists coiffeurs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete set null,
  nom text not null,
  specialite text,
  avatar_url text,
  statut text not null default 'actif'
    check (statut in ('actif', 'inactif', 'jour_off')),
  ordre_affichage integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Table: services
-- ------------------------------------------------------------
create table if not exists services (
  id uuid primary key default uuid_generate_v4(),
  nom text not null,
  description text,
  prix integer not null,             -- en FCFA
  duree_minutes integer not null default 30,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Table: tickets (file d'attente)
-- ------------------------------------------------------------
create table if not exists tickets (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,          -- code court affiché / encodé dans le QR
  client_nom text not null,
  client_telephone text not null,
  coiffeur_id uuid not null references coiffeurs(id),
  service_id uuid not null references services(id),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'termine', 'en_retard', 'annule')),
  rang integer not null,              -- position dans la file du coiffeur
  heure_estimee timestamptz not null,
  retard_minutes integer default 0,
  paiement_mode text default 'sur_place'
    check (paiement_mode in ('sur_place', 'transfert')),
  paiement_valide boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_coiffeur_jour
  on tickets (coiffeur_id, created_at);
create index if not exists idx_tickets_statut
  on tickets (statut);

-- ------------------------------------------------------------
-- Trigger générique updated_at
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_coiffeurs_updated
before update on coiffeurs
for each row execute function set_updated_at();

create trigger trg_tickets_updated
before update on tickets
for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table coiffeurs enable row level security;
alter table services enable row level security;
alter table tickets enable row level security;
alter table users enable row level security;

-- Lecture publique (site vitrine + suivi de ticket)
create policy "public_read_coiffeurs" on coiffeurs for select using (true);
create policy "public_read_services" on services for select using (true);
create policy "public_read_tickets" on tickets for select using (true);

-- Création de ticket ouverte au public (prise de rendez-vous)
create policy "public_insert_tickets" on tickets for insert with check (true);

-- Mise à jour des tickets réservée aux utilisateurs authentifiés
-- (coiffeurs / admin) via Supabase Auth
create policy "auth_update_tickets" on tickets for update
  using (auth.role() = 'authenticated');

create policy "auth_manage_coiffeurs" on coiffeurs for all
  using (auth.role() = 'authenticated');

create policy "auth_manage_services" on services for all
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Données de démo
-- ------------------------------------------------------------
insert into services (nom, description, prix, duree_minutes) values
  ('Coupe classique', 'Coupe homme aux ciseaux et tondeuse', 2000, 30),
  ('Coupe + Barbe', 'Coupe complète avec taille de barbe', 3000, 45),
  ('Dégradé (Fade)', 'Dégradé américain précis', 2500, 40),
  ('Coloration', 'Coloration cheveux ou barbe', 4000, 60)
on conflict do nothing;
