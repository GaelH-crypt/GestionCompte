# Design : Corrections et fonctionnalités transactions/récurrentes/prêts

**Date :** 2026-05-29  
**Statut :** Approuvé

---

## 1. Correction du bug d'édition de transaction

**Problème :** Cliquer sur le crayon d'édition d'une transaction provoque un crash React (`TypeError: (j ?? []).map is not a function`) qui vide la page. La cause est que `(accounts ?? [])` et `(categories ?? [])` dans `TransactionFormModal` ne protègent pas contre une valeur truthy non-tableau. De plus, `categoriesData?.results ?? []` dans `TransactionsPage` passe toujours `[]` à `ImportWizard` (les catégories ne remontent jamais).

**Corrections :**
- Dans `TransactionFormModal` : remplacer `(accounts ?? []).map(...)` par `(Array.isArray(accounts) ? accounts : []).map(...)`, idem pour `categories`.
- Dans `TransactionsPage` : corriger `categories={categoriesData?.results ?? []}` → `categories={categoriesData ?? []}`.

**Fichiers :** `frontend/src/pages/TransactionsPage.tsx`

---

## 2. Créer une transaction récurrente depuis le formulaire de transaction

**Comportement :** Le `TransactionFormModal` (création et édition) reçoit un nouveau toggle en bas du formulaire.

- Case à cocher **"Enregistrer comme récurrente"**
- Quand cochée : deux champs supplémentaires apparaissent — **Fréquence** (mensuel/hebdomadaire/annuel) et **Prochaine échéance** (date)
- Valeurs par défaut : fréquence = `monthly`, prochaine échéance = date de la transaction
- À la sauvegarde :
  1. Création/modification de la `Transaction` avec `is_recurring: true`
  2. Création d'une `RecurringTransaction` avec `name = description`, `amount`, `transaction_type`, `frequency`, `next_occurrence`, `account`, `category`
- Si on édite une transaction avec `is_recurring = true` : case pré-cochée, champs visibles avec valeurs par défaut
- Les deux appels API sont faits séquentiellement ; si le second échoue, un avertissement est affiché (pas un blocage)

**Fichiers :** `frontend/src/pages/TransactionsPage.tsx`  
**Dépendances :** import `recurringApi`, `Frequency` type

---

## 3. Afficher le détail intérêts/capital sur les cartes prêt

**Comportement :** La ligne "Mensualité totale" dans chaque carte crédit de `CreditsPage` est enrichie d'un sous-détail :

```
Mensualité totale    850,00 €
  dont capital       620,00 €   (= monthly_payment - intérêts_mois)
  dont intérêts      180,00 €   (= remaining_capital × interest_rate / 1200)
  dont assurance      50,00 €   (= insurance_monthly, si > 0)
```

Calcul purement frontend à partir des champs déjà disponibles dans `Credit`. Aucun changement backend.

**Fichiers :** `frontend/src/pages/CreditsPage.tsx`

---

## 4. Lier une transaction récurrente à un prêt

### Backend

- Ajout du champ `credit = models.ForeignKey(Credit, on_delete=models.SET_NULL, null=True, blank=True)` sur `RecurringTransaction`
- Nouvelle migration `0002_recurringtransaction_credit.py`
- Mise à jour du `RecurringTransactionSerializer` : ajout de `credit` (writable) et `credit_name` (`CharField(source='credit.name', read_only=True, allow_null=True)`)

**Fichiers :** `backend/apps/recurring/models.py`, `backend/apps/recurring/serializers.py`, nouvelle migration

### Frontend

- Mise à jour du type `RecurringTransaction` dans `types/index.ts` : ajout `credit: number | null`, `credit_name: string | null`
- `RecurringFormModal` : sélecteur optionnel "Lié à un prêt" (charge la liste des crédits actifs via `creditsApi.list()`)
- `RecurringPage` : nouvelle colonne "Prêt" dans le tableau (affiche `credit_name` si défini, `—` sinon)
- `CreditsPage` : charge les récurrentes via `recurringApi.list()` et filtre par `credit === credit.id`. Chaque carte affiche une section collapsible "Récurrentes liées" en bas (liste nom + montant). Si aucune : rien n'est affiché.

**Fichiers :** `frontend/src/types/index.ts`, `frontend/src/pages/RecurringPage.tsx`, `frontend/src/pages/CreditsPage.tsx`

---

## Périmètre explicitement exclus

- Pas d'édition d'une `RecurringTransaction` existante depuis le formulaire de transaction (le formulaire crée toujours une nouvelle entrée)
- Pas de suppression en cascade récurrente→transaction
- Pas de filtre par prêt dans la liste récurrente (ajout potentiel futur)
