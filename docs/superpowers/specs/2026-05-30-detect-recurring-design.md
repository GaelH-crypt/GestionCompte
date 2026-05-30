# Détection automatique des transactions récurrentes

**Date :** 2026-05-30  
**Statut :** Approuvé

## Objectif

Ajouter un bouton "Détecter les récurrentes" dans la page Transactions. En cliquant, l'utilisateur obtient une liste de suggestions basées sur l'analyse de son historique : chaque suggestion correspond à un pattern détecté (même description normalisée + même montant + intervalle régulier). Il peut confirmer (créer le `RecurringTransaction`) ou ignorer chaque suggestion.

---

## Backend

### Endpoint

`GET /api/transactions/detect-recurring/`

Authentification requise. Retourne une liste JSON de suggestions.

### Algorithme de détection

1. Récupérer toutes les transactions `income` ou `expense` de l'utilisateur.
2. Normaliser la description : lowercase, suppression des chiffres isolés et tokens variables (numéros de carte, références de paiement, dates embarquées). On garde le début stable de la description (ex. `"PRLV SEPA ORANGE SA"` plutôt que `"PRLV SEPA ORANGE SA VOTRE ABONNEMENT MOBILE: 07XXXX"`).
3. Grouper par `(description_normalisée, montant, transaction_type)`.
4. Filtrer les groupes avec **≥ 2 occurrences**.
5. Calculer l'intervalle médian entre dates consécutives dans chaque groupe.
6. Classer la fréquence :
   - `weekly` si médiane ∈ [5, 10] jours
   - `monthly` si médiane ∈ [25, 35] jours
   - `yearly` si médiane ∈ [340, 390] jours
   - Sinon, ignorer le groupe (intervalle trop irrégulier).
7. Exclure les groupes déjà couverts par un `RecurringTransaction` actif dont le montant et le `transaction_type` correspondent.
8. Calculer `next_occurrence` = dernière date du groupe + intervalle médian.
9. Trier par nombre d'occurrences décroissant. Limiter à 20 suggestions.

### Réponse

```json
[
  {
    "name": "PRLV SEPA ORANGE SA",
    "amount": "24.99",
    "transaction_type": "expense",
    "frequency": "monthly",
    "next_occurrence": "2026-06-21",
    "occurrence_count": 12,
    "last_date": "2026-05-21"
  }
]
```

### Fichiers modifiés

- `backend/apps/transactions/views.py` — ajout de `detect_recurring_view`
- `backend/apps/transactions/urls.py` — route `detect-recurring/`

---

## Frontend

### Bouton

Ajouté dans la barre d'outils de `TransactionsPage`, entre le bouton Importer et Nouvelle transaction.  
Label : `Détecter les récurrentes` avec icône `RefreshCw`.

### Modale de suggestions

- S'ouvre après l'appel API (avec état de chargement sur le bouton).
- Affiche un titre + le nombre de suggestions trouvées.
- Si 0 suggestions : message "Aucun nouveau pattern détecté."
- Chaque ligne : nom, montant coloré (vert/rouge), fréquence (badge), nombre d'occurrences, boutons **Ajouter** / **Ignorer**.
- **Ajouter** : appelle `recurringApi.create({...})`, invalide `['recurring']` et `['projections']`, retire la ligne de la liste.
- **Ignorer** : retire la ligne de la liste (état local uniquement, pas de persistance).
- Bouton "Fermer" en bas.

### Fichiers modifiés

- `frontend/src/api/transactions.ts` — méthode `detectRecurring()`
- `frontend/src/pages/TransactionsPage.tsx` — bouton + composant `DetectRecurringModal`

---

## Hors scope

- Persistance des suggestions ignorées (pas de table "dismissed suggestions").
- Détection de fréquence bi-mensuelle ou trimestrielle.
- Notifications automatiques sans action utilisateur.
