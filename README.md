# GestionCompte

Application web de gestion financière personnelle, entièrement auto-hébergée. Gérez vos comptes bancaires, suivez vos dépenses et revenus, planifiez vos projections financières et simulez des scénarios sans impacter vos données réelles.

## Fonctionnalités

- **Comptes** — Comptes courants, épargne, espèces, autres
- **Transactions** — Suivi des revenus et dépenses avec catégories, filtres et pagination
- **Crédits** — Calcul d'amortissement, tableau de remboursement, assurance mensuelle
- **Charges récurrentes** — Abonnements hebdomadaires, mensuels, annuels
- **Tableau de bord** — KPIs, graphiques (évolution 12 mois, répartition dépenses)
- **Projections financières** — Horizons 1 / 3 / 6 / 12 / 60 mois
- **Simulations sandbox** — Scénarios what-if non destructifs avec comparaison baseline
- **Mode sombre** — Interface fintech moderne, responsive

## Démarrage rapide

### Prérequis

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.20 (inclus avec Docker Desktop)

### Installation

```bash
# 1. Cloner le dépôt
git clone <url-du-depot> gestioncompte
cd gestioncompte

# 2. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env : changer les mots de passe et la SECRET_KEY

# 3. Lancer tous les services
docker compose up -d --build

# 4. (Optionnel) Charger les données de démonstration
docker compose exec backend python manage.py seed_demo
```

L'application est accessible sur **http://localhost**

Identifiants par défaut (définis dans `.env`) :
- **Utilisateur** : `admin` (ou la valeur de `DJANGO_SUPERUSER_USERNAME`)
- **Mot de passe** : `changeme_admin_password` (ou la valeur de `DJANGO_SUPERUSER_PASSWORD`)

> **Important** : Changez impérativement `SECRET_KEY`, `POSTGRES_PASSWORD` et `DJANGO_SUPERUSER_PASSWORD` avant toute exposition sur Internet.

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `POSTGRES_DB` | `gestioncompte` | Nom de la base de données PostgreSQL |
| `POSTGRES_USER` | `gestioncompte` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | — | Mot de passe PostgreSQL **(obligatoire, sans valeur par défaut en prod)** |
| `SECRET_KEY` | — | Clé secrète Django (min. 50 caractères aléatoires) |
| `DEBUG` | `False` | Activer le mode debug Django (`True` uniquement en dev) |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hôtes autorisés, séparés par des virgules |
| `DJANGO_SETTINGS_MODULE` | `config.settings.production` | Module de paramètres Django |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | `60` | Durée de vie du token d'accès JWT (minutes) |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | `7` | Durée de vie du token de rafraîchissement JWT (jours) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost` | Origines CORS autorisées, séparées par des virgules |
| `DJANGO_SUPERUSER_USERNAME` | `admin` | Nom d'utilisateur du compte administrateur |
| `DJANGO_SUPERUSER_EMAIL` | `admin@gestioncompte.local` | Email du compte administrateur |
| `DJANGO_SUPERUSER_PASSWORD` | — | Mot de passe du compte administrateur **(à changer)** |

> `DATABASE_URL` est assemblée automatiquement par Docker Compose — ne pas la définir manuellement.

## Sauvegarde et restauration

### Sauvegarder la base de données

```bash
docker compose exec db pg_dump \
  -U "${POSTGRES_USER:-gestioncompte}" \
  "${POSTGRES_DB:-gestioncompte}" \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restaurer une sauvegarde

```bash
# Arrêter le backend pour éviter les connexions actives
docker compose stop backend

# Restaurer
docker compose exec -T db psql \
  -U "${POSTGRES_USER:-gestioncompte}" \
  "${POSTGRES_DB:-gestioncompte}" \
  < backup_20240101_120000.sql

# Redémarrer
docker compose start backend
```

### Sauvegarde des médias

```bash
docker run --rm \
  -v gestioncompte_backend_media:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/media_$(date +%Y%m%d).tar.gz -C /data .
```

## Mise à jour

```bash
# Récupérer les nouvelles sources
git pull

# Reconstruire et relancer (migrations automatiques au démarrage)
docker compose up -d --build

# Vérifier les logs
docker compose logs -f backend
```

## Architecture

```
gestioncompte/
├── backend/                  # API Django REST Framework
│   ├── apps/
│   │   ├── authentication/   # JWT auth, gestion utilisateur
│   │   ├── accounts/         # Comptes bancaires
│   │   ├── categories/       # Catégories hiérarchiques
│   │   ├── transactions/     # Transactions avec filtres
│   │   ├── recurring/        # Charges récurrentes
│   │   ├── credits/          # Crédits + amortissement
│   │   ├── dashboard/        # Agrégats et historique
│   │   ├── projections/      # Moteur de projection
│   │   └── seed/             # Données de démonstration
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py       # Paramètres communs
│   │   │   ├── development.py
│   │   │   └── production.py
│   │   └── urls.py
│   └── Dockerfile
├── frontend/                 # React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── api/              # Clients axios par domaine
│   │   ├── components/       # Composants UI réutilisables
│   │   ├── pages/            # Pages de l'application
│   │   ├── store/            # État global Zustand
│   │   └── types/            # Interfaces TypeScript
│   └── Dockerfile
├── docker/
│   └── nginx/
│       └── nginx.conf        # Reverse proxy + SPA fallback
├── docker-compose.yml        # Stack développement/démo
├── docker-compose.prod.yml   # Stack production (restart: always)
└── .env.example              # Modèle de configuration
```

### Services Docker

| Service | Image | Rôle |
|---|---|---|
| `db` | postgres:16-alpine | Base de données PostgreSQL |
| `backend` | build local | API Django + Gunicorn (3 workers) |
| `frontend` | build local | Construction React (exit 0 après build) |
| `nginx` | nginx:1.25-alpine | Reverse proxy + serveur de fichiers statiques |

## Développement local

```bash
# Backend uniquement (SQLite, rechargement automatique)
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env
DJANGO_SETTINGS_MODULE=config.settings.development python manage.py runserver

# Frontend uniquement (hot reload)
cd frontend
npm install
npm run dev
# Accessible sur http://localhost:5173 avec proxy vers le backend sur :8000
```

## Déploiement en production

```bash
# Utiliser le fichier de composition production
docker compose -f docker-compose.prod.yml up -d --build
```

Différences avec la configuration de développement :
- `restart: always` sur tous les services
- Pas de `env_file` — les variables viennent de l'environnement système ou d'un gestionnaire de secrets
- `POSTGRES_PASSWORD` est obligatoire (erreur au démarrage si absent)

## Feuille de route

- [ ] Export CSV / PDF des transactions
- [ ] Import de relevés bancaires (OFX/QIF)
- [ ] Notifications par email (alertes de solde)
- [ ] Authentification multi-utilisateurs avec isolation des données
- [ ] Application mobile (PWA)
- [ ] Intégration Open Banking (DSP2)

## Licence

MIT — Voir [LICENSE](LICENSE) pour les détails.
