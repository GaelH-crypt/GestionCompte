RULES: list[tuple[list[str], str]] = [
    (['CARREFOUR', 'LECLERC', 'LIDL', 'ALDI', 'INTERMARCHE', 'MONOPRIX', 'CASINO', 'SUPERMARCHE', 'EPICERIE', 'FRANPRIX'], 'Alimentation'),
    (['LOYER', 'OPH', 'BAIL', 'HABITAT', 'FONCIER', 'LOCATIF', 'LOCATIVES'], 'Logement'),
    (['EDF', 'ENGIE', 'VEOLIA', 'SUEZ', 'SOSH', 'ORANGE', 'SFR', 'FREE', 'BOUYGUES', 'TELECOM', 'ELECTRICITE', 'GAZ'], 'Factures'),
    (['SNCF', 'RATP', 'UBER', 'TAXI', 'TOTAL', 'BP', 'SHELL', 'ESSENCE', 'AUTOROUTE', 'PARKING'], 'Transport'),
    (['PHARMACIE', 'MEDECIN', 'DOCTEUR', 'CLINIQUE', 'HOPITAL', 'SECU', 'CPAM', 'MUTUELLE'], 'Santé'),
    (['RESTAURANT', 'BRASSERIE', 'CAFE ', 'MCDO', 'MCDONALD', 'BURGER', 'PIZZA', 'KEBAB'], 'Restauration'),
    (['SALAIRE', 'PAIE', 'REMUNERATION'], 'Revenus'),
    (['VIR SEPA', 'VIREMENT'], 'Virement'),
]


def suggest_category(description: str) -> str | None:
    upper = description.upper()
    for keywords, category in RULES:
        for kw in keywords:
            if kw in upper:
                return category
    return None
