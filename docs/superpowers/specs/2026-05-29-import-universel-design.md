# Import XLSX Universel — Design Spec
**Date:** 2026-05-29  
**Statut:** Approuvé

## Contexte

Le parser d'import actuel est codé en dur pour le Crédit Mutuel (feuilles "Vos comptes" + "Cpt XXXXX", en-têtes à la 4e ligne). L'objectif est de rendre l'import universel pour tout fichier `.xlsx` bancaire standard, tout en conservant la compat Crédit Mutuel.

## Objectif

Permettre l'import de n'importe quel fichier `.xlsx` bancaire via un parser multi-stratégie. Les formats reconnus passent sans friction. Les formats inconnus déclenchent une étape de mapping colonnes dans le wizard.

---

## Architecture

### Backend — `parser.py`

`parse_excel(file, column_hints=None)` essaie trois stratégies dans l'ordre :

**Stratégie 1 — Crédit Mutuel** (inchangée)  
Si feuille "Vos comptes" présente ET feuilles "Cpt XXXXX" → parse existant, retourne `{accounts, transactions}`.

**Stratégie 2 — Générique**  
Pour chaque feuille :
- Scanner les 15 premières lignes pour trouver la ligne d'en-têtes
- Score par mots-clés FR/EN : `date`, `valeur`, `libellé`, `label`, `description`, `opération`, `débit`, `debit`, `crédit`, `credit`, `montant`, `amount`
- La ligne avec le meilleur score devient le header
- Mapper vers champs standards : `date`, `description`, `debit`, `credit` (ou `amount` si colonne unique)
- Chaque feuille = un compte ; nom du compte = nom de l'onglet
- Si au moins une feuille dépasse le seuil de confiance (≥ 2 colonnes reconnues dont `date` + (`amount` ou `debit`/`credit`)) → retourner `{accounts, transactions}`

**Stratégie 3 — Fallback mapping manuel**  
Si aucune feuille ne passe le seuil → lever `ColumnMappingRequired` avec les métadonnées brutes.

### Réponse d'erreur `column_mapping_required`

```json
{
  "error": "column_mapping_required",
  "sheets": [
    {
      "name": "Feuil1",
      "columns": ["Date", "Libellé", "Montant", "Solde"],
      "sample_rows": [["2026-01-01", "VIREMENT", "-120.00", "1500.00"]]
    }
  ]
}
```

### `column_hints` acceptés par `parse_excel`

```json
{
  "sheet_name": "Feuil1",
  "date_col": 0,
  "description_col": 1,
  "amount_col": 2
}
```
Ou avec débit/crédit séparés :
```json
{
  "sheet_name": "Feuil1",
  "date_col": 0,
  "description_col": 1,
  "debit_col": 2,
  "credit_col": 3
}
```

### `views.py`

`PreviewView.post` : attrape `ColumnMappingRequired` et retourne HTTP 422 avec le payload `column_mapping_required`.

---

## Frontend

### Flux wizard

**Format reconnu :**  
`upload → mapping des comptes → prévisualisation`

**Format inconnu :**  
`upload → mapping des colonnes → mapping des comptes → prévisualisation`

### Changements par fichier

**`StepUpload.tsx`**
- Supprimer "Export Crédit Mutuel uniquement"
- Texte : "Fichier bancaire `.xlsx`"
- Accepter tout `.xlsx` (pas de restriction de nom)

**`StepColumns.tsx` — nouveau**
- Affiche les `sample_rows` retournées par le backend (5 lignes)
- Onglet par feuille si plusieurs sheets
- Dropdowns : Date · Libellé · Montant (toggle "colonne unique / débit+crédit séparés")
- Validation : Date + (Montant ou Débit) obligatoires pour activer "Suivant"
- Au clic "Suivant" → re-POST `/api/import/preview/` avec le fichier (stocké en state) + `column_hints`

**`ImportWizard.tsx`**
- Ajouter `'columns'` au type `Step`
- Stocker `File` en state local (pour re-submit)
- Sur réponse 422 `column_mapping_required` → setStep('columns') au lieu d'afficher une erreur
- Le stepper affiche "2. Colonnes" uniquement si le step colonnes a été activé (état `hasColumnsStep`)
- Sinon le stepper reste à 3 étapes comme aujourd'hui

**`frontend/src/api/imports.ts`**
- `preview(file, columnHints?)` : si `columnHints` fourni, l'ajouter au `FormData` comme JSON stringifié sous la clé `column_hints`

---

## Gestion des erreurs

| Cas | Comportement |
|-----|-------------|
| Fichier non `.xlsx` | Bloqué côté frontend, message d'erreur étape upload |
| Fichier xlsx vide ou corrompu | Erreur générique "Format non reconnu" |
| Aucune colonne date détectée | → step colonnes, mapping manuel |
| Format Crédit Mutuel | Compat totale, flux inchangé |
| Feuille avec 0 transactions valides | Compte inclus dans le mapping, 0 transactions |

---

## Fichiers à modifier

**Backend**
- `backend/apps/imports/services/parser.py` — stratégie multi-parser, `ColumnMappingRequired`, détection générique
- `backend/apps/imports/views.py` — attraper `ColumnMappingRequired`, retourner 422

**Frontend**
- `frontend/src/components/ImportWizard/StepUpload.tsx` — texte générique
- `frontend/src/components/ImportWizard/StepColumns.tsx` — nouveau composant
- `frontend/src/components/ImportWizard/ImportWizard.tsx` — step `'columns'`, stockage du File, re-submit
- `frontend/src/api/imports.ts` — paramètre `columnHints` optionnel
