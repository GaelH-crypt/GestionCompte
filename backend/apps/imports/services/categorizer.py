"""Auto-catégorisation des transactions importées par mots-clés.

Chaque règle associe une liste de mots-clés (enseignes, libellés courants) à une
catégorie **principale** de l'arbre par défaut (cf. apps.categories.defaults).
On retourne volontairement un nom de catégorie de premier niveau : à l'import,
le nom suggéré crée/retrouve une catégorie ``parent=None`` (cf. imports.views).

L'ordre compte : la première règle qui matche gagne. Les règles les plus
spécifiques doivent précéder les plus larges qui pourraient les masquer —
ex. 'TAXE FONCIERE' (Impôts) avant 'FONCIER' (Logement), 'ASSURANCE VIE'
(Épargne) avant 'ASSURANCE' (Assurances).
"""

import re

RULES: list[tuple[list[str], str]] = [
    # Revenus
    # NB : pas de 'PAIE'/'PAYE' (matcherait 'PAIEMENT'), ni 'CAF' (matcherait 'CAFE').
    (['SALAIRE', 'REMUNERATION', 'POLE EMPLOI', 'ALLOCATION', 'PENSION',
      'RETRAITE', 'DIVIDENDE', 'REMBOURSEMENT'], 'Revenus'),
    # Virements internes
    (['VIR SEPA', 'VIREMENT', 'VIR INST', 'VIR RECU', 'VIR EMIS'], 'Virements internes'),
    # Banque & Frais
    (['FRAIS BANCAIRE', 'COTISATION', 'COMMISSION', 'AGIOS', 'INTERETS DEBITEURS',
      'FRAIS TENUE DE COMPTE', 'RETRAIT DAB', 'RETRAIT GAB', 'DISTRIBUTEUR'], 'Banque & Frais'),
    # Alimentation (supermarchés / épicerie)
    (['CARREFOUR', 'LECLERC', 'LIDL', 'ALDI', 'INTERMARCHE', 'MONOPRIX', 'CASINO',
      'SUPERMARCHE', 'EPICERIE', 'FRANPRIX', 'AUCHAN', 'SUPER U', 'HYPER U',
      'CORA', 'PICARD', 'GRAND FRAIS', 'BIOCOOP', 'NATURALIA'], 'Alimentation'),
    # Restaurants & Bars
    (['RESTAURANT', 'BRASSERIE', 'CAFE', 'MCDO', 'MCDONALD', 'BURGER', 'PIZZA',
      'KEBAB', 'KFC', 'SUBWAY', 'STARBUCKS', 'DELIVEROO', 'UBER EATS', 'JUST EAT',
      'BAR ', 'BISTROT'], 'Restaurants & Bars'),
    # Impôts & Taxes — AVANT Logement : 'TAXE FONCIERE' ne doit pas être
    # capturé par le mot-clé 'FONCIER' de la règle Logement.
    (['IMPOT', 'IMPOTS', 'DGFIP', 'TRESOR PUBLIC', 'FISC', 'TAXE FONCIERE',
      "TAXE D'HABITATION", 'URSSAF'], 'Impôts & Taxes'),
    # Logement (loyer, charges, énergie, eau)
    (['LOYER', 'OPH', 'BAIL', 'HABITAT', 'FONCIER', 'LOCATIF', 'LOCATIVES',
      'SYNDIC', 'COPROPRIETE', 'EDF', 'ENGIE', 'TOTALENERGIES', 'VEOLIA', 'SUEZ',
      'ELECTRICITE', 'GAZ ', 'EAU '], 'Logement'),
    # Factures & Abonnements (télécom, internet, streaming)
    (['SOSH', 'ORANGE', 'SFR', 'FREE', 'BOUYGUES', 'TELECOM', 'INTERNET', 'BOX',
      'NETFLIX', 'SPOTIFY', 'DEEZER', 'DISNEY', 'CANAL', 'PRIME VIDEO', 'YOUTUBE',
      'APPLE.COM', 'GOOGLE', 'MICROSOFT', 'OVH', 'ABONNEMENT'], 'Factures & Abonnements'),
    # Transport (carburant, transports, péage, stationnement)
    (['SNCF', 'RATP', 'UBER', 'TAXI', 'BLABLACAR', 'TOTAL', 'BP', 'SHELL', 'ESSO',
      'ESSENCE', 'CARBURANT', 'STATION', 'AUTOROUTE', 'PEAGE', 'VINCI', 'SANEF',
      'PARKING', 'NAVIGO', 'TRANSDEV', 'TER '], 'Transport'),
    # Santé
    (['PHARMACIE', 'MEDECIN', 'DOCTEUR', 'CLINIQUE', 'HOPITAL', 'SECU', 'CPAM',
      'MUTUELLE', 'DENTISTE', 'OPTIC', 'LABORATOIRE', 'KINE', 'OPHTALMO'], 'Santé'),
    # Épargne & Investissements — AVANT Assurances : 'ASSURANCE VIE' ne doit
    # pas être capturé par le mot-clé générique 'ASSURANCE'.
    (['ASSURANCE VIE', 'LIVRET A', 'LDDS', 'PEA', 'BOURSE', 'TRADE REPUBLIC',
      'BOURSORAMA VIE', 'COINBASE', 'BINANCE', 'CRYPTO'], 'Épargne & Investissements'),
    # Assurances
    (['ASSURANCE', 'AXA', 'MAIF', 'MACIF', 'MAAF', 'MATMUT', 'GMF', 'GROUPAMA',
      'ALLIANZ', 'GENERALI', 'PREVOYANCE'], 'Assurances'),
    # Loisirs & Vacances
    (['CINEMA', 'UGC', 'PATHE', 'GAUMONT', 'SALLE DE SPORT', 'FITNESS', 'BASIC FIT',
      'DECATHLON', 'BOOKING', 'AIRBNB', 'HOTEL', 'SPECTACLE', 'CONCERT', 'STEAM',
      'PLAYSTATION', 'XBOX', 'NINTENDO'], 'Loisirs & Vacances'),
    # Shopping
    (['AMAZON', 'FNAC', 'DARTY', 'BOULANGER', 'CDISCOUNT', 'ZARA', 'H&M', 'UNIQLO',
      'ZALANDO', 'IKEA', 'LEROY MERLIN', 'CASTORAMA', 'SEPHORA', 'ACTION',
      'PRIMARK', 'KIABI'], 'Shopping'),
    # Enfants & Famille
    (['CRECHE', 'GARDERIE', 'NOUNOU', 'CANTINE', 'PERISCOLAIRE'], 'Enfants & Famille'),
    # Animaux
    (['VETERINAIRE', 'VETO', 'ANIMALERIE', 'MAXI ZOO'], 'Animaux'),
    # Éducation
    (['UNIVERSITE', 'ECOLE', 'CROUS', 'FORMATION', 'UDEMY'], 'Éducation'),
    # Dons & Cadeaux
    (['DON ', 'CROIX ROUGE', 'TELETHON', 'UNICEF', 'RESTOS DU COEUR'], 'Dons & Cadeaux'),
]


def suggest_category(description: str) -> str | None:
    upper = description.upper()
    for keywords, category in RULES:
        for kw in keywords:
            if re.search(r'\b' + re.escape(kw.strip()) + r'\b', upper):
                return category
    return None
