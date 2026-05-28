# Import XLSX — Design Spec
**Date:** 2026-05-28  
**Statut:** Approuvé

## Contexte

L'application doit pouvoir ingérer les exports Excel du Crédit Mutuel. Ces fichiers contiennent une feuille récapitulative des comptes ("Vos comptes") et une feuille de transactions par compte (colonnes : Date, Valeur, Libellé, Débit, Crédit, Solde, Dev). La ligne d'en-tête réelle se trouve à la 4e ligne de chaque feuille (index 3 pandas).

## Objectif

Permettre à l'utilisateur d'importer un fichier `.xlsx` Crédit Mutuel via un wizard modal 3 étapes, avec mapping des comptes, détection des doublons et auto-catégorisation corrigeable.

---

## Architecture

### Backend — nouvel app Django `imports`

**`POST /api/import/preview/`**  
- Reçoit : `multipart/form-data` avec le fichier `.xlsx`  
- Parse le fichier (pandas + openpyxl) :  
  - Feuille "Vos comptes" → liste des comptes (nom, RIB, solde initial)  
  - Feuilles "Cpt XXXXX" → transactions (date, libellé, débit/crédit, montant)  
- Détecte les doublons contre les transactions existantes de l'utilisateur (même account_rib + date + montant + libellé)  
- Applique les règles d'auto-catégorisation sur le libellé  
- Retourne : comptes détectés, transactions parsées avec catégorie suggérée, liste des IDs doublons  
- **Rien n'est écrit en base**

**`POST /api/import/confirm/`**  
- Reçoit : mapping comptes (RIB → account_id existant ou `{create: true, name, type}`), liste des transactions avec catégorie finale, flag doublons  
- Crée les comptes manquants  
- Crée les transactions filtrées (hors doublons)  
- Retourne : résumé (N comptes créés, N transactions importées)

### Frontend — wizard modal

Bouton "Importer un fichier" sur la page Transactions ou Comptes.  
État du wizard géré localement dans le composant React (pas de store global).

---

## Étapes du wizard

### Étape 1 — Upload
- Drag & drop ou `<input type="file">` `.xlsx` uniquement
- Appel à `/api/import/preview/` avec spinner
- Erreur affichée si : fichier invalide, feuille "Vos comptes" absente, parsing impossible

### Étape 2 — Mapping des comptes
- Liste des comptes détectés (nom + RIB + solde du fichier)
- Pour chacun : select avec les comptes existants + option "Créer un nouveau compte"
- Si "Créer" : nom pré-rempli (libellé du fichier), type deviné :
  - `LIVRET`, `LDDS` → `savings`
  - `C/C`, `EUROCOMPTE` → `checking`
  - `PRET`, `CREDIT`, `PASSEPORT` → `other`
  - défaut → `checking`

### Étape 3 — Prévisualisation & confirmation
- Tableau paginé (50 lignes par page) des transactions à importer :
  - Date · Libellé · Montant (rouge si débit, vert si crédit) · Compte · Catégorie (select modifiable)
- Bandeau résumé : `"127 nouvelles transactions · 3 doublons ignorés"`
- Bouton "Importer" → appel `/api/import/confirm/` → toast succès → fermeture modale → rafraîchissement de la liste

---

## Détection des doublons

Critères : même `account` + même `date` + même `amount` + même `description`.  
Les doublons sont exclus de l'import par défaut. Ils sont visibles dans le bandeau résumé (count seulement, pas listés).

---

## Auto-catégorisation

Règles par mots-clés (insensible à la casse, recherche dans le libellé) :

| Mots-clés | Catégorie |
|-----------|-----------|
| CARREFOUR, LECLERC, LIDL, ALDI, INTERMARCHE, MONOPRIX, CASINO | Alimentation |
| LOYER, OPH, BAIL, HABITAT | Logement |
| EDF, ENGIE, VEOLIA, SUEZ, SOSH, ORANGE, SFR, FREE, BOUYGUES | Factures |
| SNCF, RATP, UBER, TAXI, TOTAL, BP, SHELL | Transport |
| PHARMACIE, MEDECIN, DOCTEUR, CLINIQUE, HOPITAL, SECU | Santé |
| VIR SEPA, VIREMENT | Virement (`transfer`) |
| SALAIRE, PAIE | Revenus |

- Pas de match → catégorie `null` (sans catégorie)
- L'utilisateur peut modifier la catégorie dans l'étape 3 avant confirmation
- Si la catégorie suggérée n'existe pas encore en base → `null` (pas de création automatique de catégorie)

---

## Gestion des erreurs

| Cas | Comportement |
|-----|-------------|
| Fichier non xlsx | Message d'erreur étape 1, pas de progression |
| Feuille "Vos comptes" absente | Erreur parsing : "Format non reconnu" |
| Feuille de compte sans transactions | Compte inclus dans le mapping, 0 transactions |
| Compte mappé sur un compte d'un autre utilisateur | Rejeté côté backend (403) |
| Timeout parsing (fichier très lourd) | Erreur générique avec suggestion de découper |

---

## Fichiers à créer / modifier

**Backend**
- `backend/apps/imports/` — nouvel app (models vide, views, urls, services)
- `backend/apps/imports/services/parser.py` — parsing pandas du format Crédit Mutuel
- `backend/apps/imports/services/categorizer.py` — règles mots-clés
- `backend/apps/imports/services/deduplicator.py` — détection doublons
- `backend/apps/imports/views.py` — PreviewView, ConfirmView
- `backend/apps/imports/urls.py`
- `backend/config/urls.py` — include imports.urls

**Frontend**
- `frontend/src/components/ImportWizard/` — wizard modal
  - `ImportWizard.tsx` — shell modal + stepper
  - `StepUpload.tsx`
  - `StepMapping.tsx`
  - `StepPreview.tsx`
- `frontend/src/api/imports.ts` — appels API preview + confirm
