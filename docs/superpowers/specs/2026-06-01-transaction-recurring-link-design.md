# Spec : Lien transaction ↔ charge fixe

**Date** : 2026-06-01  
**Branche cible** : à créer depuis `main`  
**Statut** : approuvé, prêt pour implémentation

---

## Contexte

Le moteur de projection détecte le double-comptage par heuristique `(montant, type, compte)`. Cette approche échoue quand le montant varie (ex : paiement nounou) ou quand deux charges fixes ont le même montant. La solution : permettre de lier explicitement une transaction importée à sa charge fixe, améliorant ainsi la précision des projections.

---

## Fonctionnalités

### 1. Lien explicite transaction → charge fixe

L'utilisateur peut, depuis l'écran des transactions, lier une transaction à l'une de ses charges fixes actives. Le lien est manuel et volontaire ; aucune suggestion automatique.

### 2. Colonne d'affichage dans le tableau

Une colonne compacte (36 px, non-redimensionnable) affiche une icône `Link2` colorée (`text-brand-500`) si la transaction est liée. Au survol, un tooltip natif (`title`) affiche le nom de la charge fixe. Sur mobile, une ligne `🔗 Nom` apparaît sous la description.

### 3. Avance automatique de `next_occurrence`

Quand un lien est créé, si `tx.date >= rt.next_occurrence`, la `next_occurrence` de la charge fixe est avancée d'un pas de fréquence (`+1 mois`, `+1 semaine` ou `+1 an`). Cela maintient les charges fixes à jour sans action manuelle supplémentaire.

### 4. Moteur de projection amélioré

La détection du double-comptage dans `build_engine_from_user` devient bi-niveau :
1. **Priorité** : si `rt.id` est dans les `recurring_transaction_id` des transactions liées du mois courant → occurrence skippée
2. **Fallback** : heuristique `(amount, transaction_type, account_id)` existante pour les transactions non liées

---

## Architecture

### Backend

#### Modèle

```python
# apps/transactions/models.py
recurring_transaction = models.ForeignKey(
    'recurring.RecurringTransaction',
    on_delete=models.SET_NULL,
    null=True, blank=True,
    related_name='linked_transactions',
)
```

Migration : `0004_transaction_recurring_transaction.py`

#### Serializer

`TransactionSerializer` expose :
- `recurring_transaction` (int, writable, nullable) — ID de la charge fixe
- `recurring_transaction_name` (str, read-only, `source='recurring_transaction.name'`, `allow_null=True`)

#### Endpoint

```
POST /transactions/{id}/link-recurring/
Body : { "recurring_id": int | null }
```

Logique :
1. Récupère la transaction (appartient à `request.user`)
2. Si `recurring_id` est null → retire le lien (`transaction.recurring_transaction = None`), save
3. Si `recurring_id` non null :
   - Récupère le `RecurringTransaction` (appartient à `request.user`, `is_active=True`)
   - Pose le lien (`transaction.recurring_transaction = rt`)
   - Si `transaction.date >= rt.next_occurrence` : avance `rt.next_occurrence` d'un pas de fréquence et save
   - Save la transaction
4. Retourne la transaction sérialisée

Erreurs : 404 si transaction ou recurring introuvable, 400 si type incompatible (income ↔ expense).

#### Engine (`build_engine_from_user`)

```python
# Lien explicite — priorité
_linked_this_month = set(
    Transaction.objects.filter(
        user=user,
        date__gte=first_of_month,
        date__lte=today,
        recurring_transaction__isnull=False,
    ).values_list('recurring_transaction_id', flat=True)
)

# Dans la boucle daily_events :
if rt.id in _linked_this_month:
    occ = occ + step  # déjà payé ce mois via lien explicite
elif (rt.amount, rt.transaction_type, rt.account_id) in _paid_this_month:
    occ = occ + step  # fallback heuristique
```

### Frontend

#### Types (`src/types/index.ts`)

```ts
interface Transaction {
  // champs existants…
  recurring_transaction: number | null
  recurring_transaction_name: string | null
}
```

#### API (`src/api/transactions.ts`)

```ts
linkRecurring: (txId: number, recurringId: number | null) =>
  client.post(`/transactions/${txId}/link-recurring/`, { recurring_id: recurringId }),
```

#### Colonne tableau (`TransactionsPage.tsx`)

Ajout dans `COLUMNS` :
```ts
{ key: 'recurring', label: '', width: 36, resizable: false }
```

Rendu de la cellule :
```tsx
<td className="px-2 py-3 text-center">
  {tx.recurring_transaction_name && (
    <Link2
      className="h-3.5 w-3.5 text-brand-500 mx-auto"
      title={tx.recurring_transaction_name}
    />
  )}
</td>
```

#### Bouton dans les actions

Icône `Link` (lucide) ajoutée avant le crayon :
- `text-brand-500` si liée, `text-gray-500` sinon
- Au clic : ouvre `LinkRecurringModal`

#### `LinkRecurringModal`

- Liste les `RecurringTransaction` actives du même `transaction_type`
- Barre de recherche (filtre client sur `name`)
- Clic sur une ligne → sélection (highlight brand)
- Bouton "Lier" → appelle `linkRecurring`, invalide `['transactions']` et `['projections']`
- Si déjà liée : bouton "Retirer le lien" (appelle `linkRecurring(txId, null)`)
- Fermeture : croix + clic extérieur

#### Mobile (`TransactionsPage.tsx`)

Dans la card mobile, sous la ligne description/montant :
```tsx
{tx.recurring_transaction_name && (
  <span className="text-xs text-brand-400 pl-6">
    🔗 {tx.recurring_transaction_name}
  </span>
)}
```

---

## Tests

### Backend
- Migration appliquée sans erreur
- `POST /link-recurring/` avec `recurring_id` valide : FK posée, `next_occurrence` avancée si applicable
- `POST /link-recurring/` avec `recurring_id: null` : FK retirée
- `POST /link-recurring/` avec type incompatible : 400
- Engine : transaction liée → occurrence skippée via lien (pas heuristique)
- Engine : transaction non liée avec même montant → fallback heuristique fonctionne toujours

### Frontend
- `LinkRecurringModal` : recherche filtre la liste
- Lier → icône apparaît dans la colonne, tooltip correct
- Retirer le lien → icône disparaît
- Mobile : badge affiché/masqué selon lien

---

## Ce qui n'est PAS dans ce scope

- Suggestion automatique de lien lors de l'import
- Historique des liens
- Lien depuis l'écran des charges fixes
- Modification de `next_occurrence` lors du retrait d'un lien
