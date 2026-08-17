# DS CUT — PWA de gestion de file d'attente pour salon de coiffure

Application Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase,
installable en PWA sur iOS/Android, prête pour GitHub → Vercel.

## 📁 Structure du projet

```
ds-cut/
├── public/
│   ├── manifest.json          # Manifest PWA (nom, icônes, couleurs)
│   └── icons/                 # icon-192.png, icon-512.png, icon-maskable-512.png
│                               # ⚠️ à fournir toi-même (voir "Icônes" plus bas)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Layout racine + métadonnées PWA
│   │   ├── globals.css
│   │   ├── page.tsx            # Accueil + réservation client (3 étapes)
│   │   ├── ticket/[id]/page.tsx  # Suivi du ticket en temps réel + retard
│   │   ├── coiffeur/page.tsx     # Dashboard coiffeur (file, statuts, retard)
│   │   └── admin/page.tsx        # Dashboard Akim (CRUD coiffeurs, vue d'ensemble)
│   ├── components/
│   │   ├── TicketCard.tsx      # Carte ticket + QR code
│   │   └── StatusBadge.tsx
│   ├── lib/
│   │   ├── supabase.ts         # Client Supabase
│   │   └── queue.ts            # Logique métier : rangs, retards, transitions
│   └── types/
│       └── database.ts         # Types TypeScript miroir du schéma SQL
├── supabase/
│   └── schema.sql              # Tables, RLS, données de démo
├── next.config.js              # Config PWA (service worker, cache offline)
├── tailwind.config.ts
├── .env.example
└── package.json
```

## 🗄️ Base de données (Supabase)

Le fichier `supabase/schema.sql` crée les 4 tables demandées :

- **`users`** : comptes internes (admin Akim + coiffeurs), liés à Supabase Auth.
- **`coiffeurs`** : nom, spécialité, avatar, statut (`actif` / `inactif` / `jour_off`).
- **`services`** : prestations, prix (FCFA), durée en minutes.
- **`tickets`** : file d'attente — client, coiffeur, service, statut, **rang**,
  heure estimée, retard, mode de paiement.

Exécute ce script dans l'éditeur SQL de ton projet Supabase (Dashboard →
SQL Editor → New query → coller → Run).

## ⚙️ Installation

```bash
git clone <ton-repo>
cd ds-cut
npm install
cp .env.example .env.local   # renseigne tes clés Supabase
npm run dev
```

## 🔑 Variables d'environnement (Vercel)

Dans Vercel → Project Settings → Environment Variables, ajoute :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 🖼️ Icônes PWA

Génère les 3 icônes attendues par `manifest.json` (logo DS CUT sur fond plein)
et place-les dans `public/icons/` :
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512, zone de sécurité centrale ~80%)

Un générateur pratique : https://realfavicongenerator.net ou
https://maskable.app/editor

## 🔐 Sécurité des données clients (table `tickets`)

La table `tickets` (noms, téléphones) **n'a aucune policy RLS publique**,
ni en lecture ni en écriture. C'est la seule table entièrement fermée à
la clé anonyme : personne ne peut lister ou interroger les tickets
directement, même avec `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Tout l'espace public passe par 3 fonctions RPC (`SECURITY DEFINER`,
définies dans `supabase/schema.sql`) qui ne renvoient ou ne modifient
jamais plus qu'un ticket précis, identifié par son UUID :

- `create_ticket(...)` — crée le ticket, calcule le rang et l'heure
  estimée côté serveur.
- `get_ticket_by_id(p_ticket_id)` — renvoie un seul ticket, jamais une liste.
- `declare_retard_client(p_ticket_id, p_minutes)` — met à jour uniquement
  le ticket dont on connaît déjà l'UUID.

Conséquence : la page `/ticket/[id]` ne peut plus utiliser Supabase
Realtime pour le suivi en direct (Realtime respecte les policies RLS, et
il n'y en a plus pour l'anonyme sur cette table). Le suivi se fait donc
par **sondage périodique** (toutes les 6 secondes) via `get_ticket_by_id`
— largement suffisant pour ce cas d'usage.

Les dashboards **coiffeur** et **admin**, eux, restent en lecture/écriture
directe sur la table `tickets` (policies `auth_read_tickets` /
`auth_update_tickets`), car ils sont toujours authentifiés via Supabase
Auth avant d'y accéder.

## 🔒 Authentification

- **Coiffeurs & Akim** se connectent via **Supabase Auth** (email/mot de passe).
  Crée les comptes depuis le Dashboard Supabase (Authentication → Users), puis
  relie chaque `auth.users.id` à une ligne `users` (`role = 'coiffeur'` ou
  `'admin'`) et, pour les coiffeurs, à une ligne `coiffeurs.user_id`.
- La page `/admin` est protégée par un formulaire de connexion Supabase Auth.
- La page `/coiffeur` suppose une session active et résout automatiquement le
  coiffeur associé (`getCoiffeurConnecte()` dans le fichier — adapte cette
  fonction si ta stratégie d'auth diffère, ex: sous-domaine par coiffeur).

## 🧠 Logique de gestion des retards (file d'attente)

Implémentée dans `src/lib/queue.ts` :

- Chaque ticket a un **rang** au sein de la file de son coiffeur.
- `signalerRetard(ticketId)` : le coiffeur marque un client en retard → le
  ticket est **rétrogradé de `RETARD_DECALAGE` positions** (2 par défaut,
  modifiable) dans la file, sans jamais bloquer les clients déjà présents
  derrière lui. Le client ne perd pas son ticket, seulement sa priorité.
- `demarrerTicket` / `terminerTicket` : transitions de statut qui font
  avancer automatiquement la file (le tri se fait dynamiquement par rang
  parmi les tickets encore actifs).
- Toutes les vues (client, coiffeur, admin) sont **synchronisées en temps
  réel** via Supabase Realtime (`postgres_changes`).

## 📱 PWA

- `manifest.json` + service worker généré par `@ducanh2912/next-pwa`
  (activé uniquement en production / build Vercel).
- Installable depuis Chrome (Android) et Safari (iOS → « Sur l'écran
  d'accueil »).
- Cache offline de base des pages déjà visitées.

## 🚀 Déploiement Vercel

1. Pousse ce dossier sur GitHub.
2. Sur [vercel.com](https://vercel.com) → *New Project* → importe le repo.
3. Ajoute les variables d'environnement Supabase.
4. Déploie — Vercel détecte automatiquement Next.js.

## ✅ Ce qui est déjà implémenté

- Réservation client en 3 étapes avec exclusion des coiffeurs indisponibles.
- Génération de ticket avec QR code unique + infos de paiement (sur place ou
  transfert/appel au `776729740`, sans redirection WhatsApp).
- Suivi de ticket en temps réel + signalement de retard côté client.
- Dashboard coiffeur : démarrer / terminer / marquer en retard.
- Dashboard Akim : CRUD coiffeurs, toggle disponibilité, vue d'ensemble du jour.

## 🔜 Pistes d'amélioration

- QR Code marchand du salon (image statique à afficher à côté du QR ticket —
  ajoute l'image dans `public/` et un `<Image>` dans `TicketCard.tsx`).
- Notifications push (via Web Push API) quand le tour du client approche.
- Historique des prestations et statistiques par coiffeur (graphiques).
