### 1. Faux positifs structurels — le job écrit des matchs qu'il ne devrait pas

Des matchings incorrects, silencieux, difficiles à détecter après coup.

Manque de filtres :

- `matched_invoice_id IS NULL` -> éviter de rematcher les transactions déjà traitées
- `deleted_at IS NULL` -> éviter de rematcher les transactions delteded
- `amount < 0` -> uniquement les transactions sortant

Manque d'index d'unicité :

- Factures déjà liées à une autre transaction jamais exclues

Choix arbitraire entre plusieurs candidats :

- date la plus proche + label contient le nom du fournisseur ou le num de facture (pourquoi pas, mais besoin de validation métier)

### 2. Montants en `real` + égalité flottante — argent incorrect

La comparaison peut ne pas marcher avec les floats ex. `9.12 + 1.02` -> faux match ou match manqués

- Schéma : `amount`, `tax_free_total`, `vat_amount` en `real`.
- Code : `invoice.tax_free_total + invoice.vat_amount === Math.abs(transaction.amount)`.

### 3. Injection SQL

Pas une bonne pratique en général.

```sql
where company_id = '${companyId}'
where siren = '${companySiren}'
```

### 4. Dates fragiles — fenêtre d'échéance potentiellement décalée d'un jour

Matchs hors / dans la fenêtre des -3j/+30j

- `dayDiff` utilise `Date` + millisecondes / 86400000 + `Math.floor` -> sensible au fuseau et à l'heure locale.

Pas critique si on est sur le même fuseau horaire

### 5. Erreurs avalées + résumé trompeur

Logs pas précis en cas d'erreur + echoue en silence -> ne pas comprendre ce qui peut causer l'erreur et ne pas être au courant qu'il y ai eu un erreur

```ts
} catch (e) {
  console.log("skip", e);
}
```

### 6. Schéma trop faible

Une DB plus robuste pourrait aider à éviter beaucoup d'erreurs (arrondi, dates, doublons).

- Pas de FK (`account.company_id`, `transaction.account_id`, `matched_invoice_id`).
- Pas d'unicité « une facture n'est liée qu'à une transaction ».
- Argent en `real`, échéance en `varchar` au lieu de `date` / `numeric`.

### 7. Tests quasi absents

On peut « améliorer » le matcher et casser la règle produit sans s'en apercevoir. Aujourd'hui seuls `normalizeLabel` et un `dayDiff` heureux sont couverts.

### Note

Sans doute laisser délibérément, mais il y avait déjà des règles métier présentes dans le bout de code qui ne sont pas précisées dans le sujet :

- date la plus proche + label contient le nom du fournisseur ou le num de facture
- les `invoice_status` ont sans doute également un rôle de filtre à jouer permettant de récupérer le bon devis pour une transaction, mais besoin de précision métier

#### Problèmes rencontrés
Erreur au prmeier lancement lié ces règles:
```sh
skip TypeError: Cannot read properties of null (reading 'trim')
```
- le buying_invoice f0000013-0000-4000-8000-000000000001 n'a pas de supplier_name
- une transaction avec un account_id inéxistant ac000000-0000-4000-8000-000000000099
- changement d'ordre dans le seed pour les FK : `company` → `account` → `buying_invoice` → `transaction`.

#### Amélioration

- le filtrage pourrait être fait directement côté sql -> moins de soucis avec l'arrondi
- test d'intégration avec un jeu de données avec le plus de test cases limites possible
