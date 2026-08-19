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

-- `create trigger` n'a pas d'équivalent "if not exists" en PostgreSQL :
-- on supprime donc l'éventuel trigger existant avant de le recréer, pour
-- que ce script reste ré-exécutable sans erreur (ex: si tu relances une
-- version mise à jour de ce fichier sur une base déjà migrée).
drop trigger if exists trg_coiffeurs_updated on coiffeurs;
create trigger trg_coiffeurs_updated
before update on coiffeurs
for each row execute function set_updated_at();

drop trigger if exists trg_tickets_updated on tickets;
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

-- Lecture publique (site vitrine : menu des services + coiffeurs
-- disponibles). Ces tables ne contiennent aucune donnée personnelle.
drop policy if exists "public_read_coiffeurs" on coiffeurs;
create policy "public_read_coiffeurs" on coiffeurs for select using (true);

drop policy if exists "public_read_services" on services;
create policy "public_read_services" on services for select using (true);

-- ⚠️ IMPORTANT : la table `tickets` contient des données personnelles
-- (nom, téléphone). Elle N'A PAS de policy de lecture/écriture publique.
-- Un visiteur anonyme ne peut donc jamais lister ni interroger cette
-- table directement, même avec la clé anonyme — la seule table de la
-- base entièrement fermée au public. Toute lecture/écriture publique
-- passe obligatoirement par les fonctions RPC ci-dessous (create_ticket,
-- get_ticket_by_id, declare_retard_client), qui sont conçues pour ne
-- jamais renvoyer plus qu'un seul ticket, précisément identifié par son
-- UUID (donc jamais devinable ni listable).

-- Si une ancienne version de ce script a déjà créé des policies
-- publiques larges sur `tickets` (public_read_tickets /
-- public_insert_tickets), on les supprime pour ne pas les laisser
-- traîner en base — elles ne sont plus définies ci-dessous.
drop policy if exists "public_read_tickets" on tickets;
drop policy if exists "public_insert_tickets" on tickets;

-- Lecture et mise à jour réservées aux utilisateurs authentifiés
-- (coiffeurs / admin) via Supabase Auth — utilisées par les dashboards.
drop policy if exists "auth_read_tickets" on tickets;
create policy "auth_read_tickets" on tickets for select
  using (auth.role() = 'authenticated');

drop policy if exists "auth_update_tickets" on tickets;
create policy "auth_update_tickets" on tickets for update
  using (auth.role() = 'authenticated');

drop policy if exists "auth_manage_coiffeurs" on coiffeurs;
create policy "auth_manage_coiffeurs" on coiffeurs for all
  using (auth.role() = 'authenticated');

drop policy if exists "auth_manage_services" on services;
create policy "auth_manage_services" on services for all
  using (auth.role() = 'authenticated');

-- La table `users` a RLS activée mais n'avait aucune policy définie :
-- par défaut Postgres refuse alors TOUT accès, y compris aux comptes
-- authentifiés. Ça cassait silencieusement la jointure coiffeurs->users
-- utilisée par /coiffeur pour retrouver la fiche coiffeur liée au compte
-- connecté (l'utilisateur restait bloqué sur "compte non relié").
drop policy if exists "auth_manage_users" on users;
create policy "auth_manage_users" on users for all
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Fonctions RPC sécurisées (accès public contrôlé aux tickets)
-- ------------------------------------------------------------

-- Crée un ticket pour un client. Recalcule le rang et l'heure estimée
-- côté serveur (jamais confié au client), vérifie que le coiffeur est
-- bien actif, et renvoie uniquement le ticket créé.
create or replace function public.create_ticket(
  p_client_nom text,
  p_client_telephone text,
  p_coiffeur_id uuid,
  p_service_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut_coiffeur text;
  v_duree integer;
  v_rang integer;
  v_code text;
  v_heure_estimee timestamptz;
  v_ticket tickets%rowtype;
begin
  if length(trim(p_client_nom)) = 0 or length(trim(p_client_telephone)) = 0 then
    raise exception 'Nom et téléphone requis';
  end if;

  select statut into v_statut_coiffeur from coiffeurs where id = p_coiffeur_id;
  if v_statut_coiffeur is null then
    raise exception 'Coiffeur introuvable';
  end if;
  if v_statut_coiffeur <> 'actif' then
    raise exception 'Ce coiffeur n''est pas disponible aujourd''hui';
  end if;

  select duree_minutes into v_duree
  from services where id = p_service_id and actif = true;
  if v_duree is null then
    raise exception 'Service introuvable ou inactif';
  end if;

  select coalesce(max(rang), 0) + 1 into v_rang
  from tickets
  where coiffeur_id = p_coiffeur_id
    and statut in ('en_attente', 'en_cours', 'en_retard');

  v_code := 'DSC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  v_heure_estimee := now() + ((v_rang - 1) * v_duree || ' minutes')::interval;

  insert into tickets (
    code, client_nom, client_telephone, coiffeur_id, service_id,
    statut, rang, heure_estimee
  ) values (
    v_code, trim(p_client_nom), trim(p_client_telephone), p_coiffeur_id, p_service_id,
    'en_attente', v_rang, v_heure_estimee
  )
  returning * into v_ticket;

  return row_to_json(v_ticket);
end;
$$;

revoke all on function public.create_ticket from public;
grant execute on function public.create_ticket to anon, authenticated;

-- Renvoie UN SEUL ticket, identifié par son UUID exact (impossible à
-- deviner). Ne permet aucun listage ni filtrage par nom/téléphone/statut.
create or replace function public.get_ticket_by_id(p_ticket_id uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'id', t.id,
    'code', t.code,
    'client_nom', t.client_nom,
    'client_telephone', t.client_telephone,
    'coiffeur_id', t.coiffeur_id,
    'service_id', t.service_id,
    'statut', t.statut,
    'rang', t.rang,
    'heure_estimee', t.heure_estimee,
    'retard_minutes', t.retard_minutes,
    'paiement_mode', t.paiement_mode,
    'paiement_valide', t.paiement_valide,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'coiffeur', json_build_object(
      'id', c.id, 'nom', c.nom, 'specialite', c.specialite, 'statut', c.statut
    ),
    'service', json_build_object(
      'id', s.id, 'nom', s.nom, 'prix', s.prix, 'duree_minutes', s.duree_minutes
    )
  )
  from tickets t
  join coiffeurs c on c.id = t.coiffeur_id
  join services s on s.id = t.service_id
  where t.id = p_ticket_id;
$$;

revoke all on function public.get_ticket_by_id from public;
grant execute on function public.get_ticket_by_id to anon, authenticated;

-- Permet au client de signaler un retard sur SON ticket (par UUID),
-- sans jamais lui donner accès en lecture/écriture à la table.
create or replace function public.declare_retard_client(
  p_ticket_id uuid,
  p_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_minutes < 0 or p_minutes > 120 then
    raise exception 'Valeur de retard invalide';
  end if;

  update tickets
  set retard_minutes = p_minutes
  where id = p_ticket_id
    and statut = 'en_attente';
end;
$$;

revoke all on function public.declare_retard_client from public;
grant execute on function public.declare_retard_client to anon, authenticated;

-- ------------------------------------------------------------
-- Données de démo
-- ------------------------------------------------------------
insert into services (nom, description, prix, duree_minutes) values
  ('Coupe classique', 'Coupe homme aux ciseaux et tondeuse', 2000, 30),
  ('Coupe + Barbe', 'Coupe complète avec taille de barbe', 3000, 45),
  ('Dégradé (Fade)', 'Dégradé américain précis', 2500, 40),
  ('Coloration', 'Coloration cheveux ou barbe', 4000, 60)
on conflict do nothing;
