from apps.imports.services.categorizer import suggest_category


def test_suggest_category_matches_keyword():
    assert suggest_category('PAIEMENT CARREFOUR MARKET') == 'Alimentation'
    assert suggest_category('VIR SALAIRE ENTREPRISE') == 'Revenus'
    assert suggest_category('LOYER MARS') == 'Logement'
    assert suggest_category('PRLV EDF FACTURE') == 'Logement'
    assert suggest_category('SNCF BILLET TRAIN') == 'Transport'
    assert suggest_category('PHARMACIE DU CENTRE') == 'Santé'
    assert suggest_category('RESTAURANT LE BISTROT') == 'Restaurants & Bars'
    assert suggest_category('CB MCDONALD PARIS') == 'Restaurants & Bars'


def test_suggest_category_enriched_keywords():
    assert suggest_category('PRLV NETFLIX.COM') == 'Factures & Abonnements'
    assert suggest_category('CB DECATHLON LYON') == 'Loisirs & Vacances'
    assert suggest_category('CB AMAZON EU') == 'Shopping'
    assert suggest_category('PRLV ASSURANCE MAIF') == 'Assurances'
    assert suggest_category('IMPOT SUR LE REVENU DGFIP') == 'Impôts & Taxes'
    assert suggest_category('TOTALENERGIES STATION') == 'Logement'


def test_suggest_category_no_match():
    assert suggest_category('LIBELLE INCONNU XYZ') is None
