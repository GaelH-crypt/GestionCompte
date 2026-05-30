"""Arbre de catégories génériques par défaut pour la gestion de compte personnel.

Source unique de vérité réutilisée par :
- la commande ``seed_categories`` (provisionnement sans données de démo) ;
- la commande ``seed_demo`` (données de démonstration).

Structure : grandes catégories de dépenses/revenus avec sous-catégories,
couvrant les postes les plus courants d'un budget personnel aujourd'hui.
Les sous-catégories héritent de la couleur du parent sauf override explicite.
"""

# Chaque entrée : {name, color, icon, children: [{name, icon, color?}, ...]}
DEFAULT_CATEGORIES = [
    {
        'name': 'Alimentation', 'color': '#22c55e', 'icon': 'ShoppingCart',
        'children': [
            {'name': 'Courses', 'icon': 'ShoppingCart'},
            {'name': 'Boulangerie', 'icon': 'Croissant'},
            {'name': 'Marché', 'icon': 'Apple'},
            {'name': 'Livraison de repas', 'icon': 'Bike'},
        ],
    },
    {
        'name': 'Restaurants & Bars', 'color': '#f97316', 'icon': 'Utensils',
        'children': [
            {'name': 'Restaurant', 'icon': 'Utensils'},
            {'name': 'Fast-food', 'icon': 'Sandwich'},
            {'name': 'Café & Bar', 'icon': 'Coffee'},
        ],
    },
    {
        'name': 'Logement', 'color': '#3b82f6', 'icon': 'Home',
        'children': [
            {'name': 'Loyer', 'icon': 'Home'},
            {'name': 'Crédit immobilier', 'icon': 'Landmark'},
            {'name': 'Charges & Copropriété', 'icon': 'Building'},
            {'name': 'Eau', 'icon': 'Droplet'},
            {'name': 'Électricité & Gaz', 'icon': 'Zap'},
            {'name': 'Entretien & Réparations', 'icon': 'Wrench'},
            {'name': 'Ameublement & Déco', 'icon': 'Sofa'},
        ],
    },
    {
        'name': 'Transport', 'color': '#f59e0b', 'icon': 'Car',
        'children': [
            {'name': 'Carburant', 'icon': 'Fuel'},
            {'name': 'Transports en commun', 'icon': 'Bus'},
            {'name': 'Taxi & VTC', 'icon': 'Car'},
            {'name': 'Stationnement & Péage', 'icon': 'SquareParking'},
            {'name': 'Entretien véhicule', 'icon': 'Wrench'},
        ],
    },
    {
        'name': 'Factures & Abonnements', 'color': '#6366f1', 'icon': 'Repeat',
        'children': [
            {'name': 'Téléphone mobile', 'icon': 'Smartphone'},
            {'name': 'Internet & Box', 'icon': 'Wifi'},
            {'name': 'Streaming & Médias', 'icon': 'Tv'},
            {'name': 'Logiciels & Apps', 'icon': 'Monitor'},
            {'name': 'Abonnements divers', 'icon': 'Repeat'},
        ],
    },
    {
        'name': 'Santé', 'color': '#ef4444', 'icon': 'Heart',
        'children': [
            {'name': 'Médecin', 'icon': 'Stethoscope'},
            {'name': 'Pharmacie', 'icon': 'Pill'},
            {'name': 'Dentiste', 'icon': 'Smile'},
            {'name': 'Optique', 'icon': 'Glasses'},
            {'name': 'Mutuelle', 'icon': 'HeartPulse'},
        ],
    },
    {
        'name': 'Assurances', 'color': '#8b5cf6', 'icon': 'Shield',
        'children': [
            {'name': 'Assurance habitation', 'icon': 'Shield'},
            {'name': 'Assurance auto', 'icon': 'ShieldCheck'},
            {'name': 'Assurance santé & prévoyance', 'icon': 'ShieldPlus'},
        ],
    },
    {
        'name': 'Loisirs & Vacances', 'color': '#06b6d4', 'icon': 'Gamepad2',
        'children': [
            {'name': 'Sport & Fitness', 'icon': 'Dumbbell'},
            {'name': 'Cinéma & Spectacles', 'icon': 'Film'},
            {'name': 'Voyages & Hôtels', 'icon': 'Plane'},
            {'name': 'Sorties & Événements', 'icon': 'Ticket'},
            {'name': 'Hobbies', 'icon': 'Palette'},
            {'name': 'Jeux vidéo', 'icon': 'Gamepad2'},
        ],
    },
    {
        'name': 'Shopping', 'color': '#ec4899', 'icon': 'ShoppingBag',
        'children': [
            {'name': 'Vêtements & Chaussures', 'icon': 'Shirt'},
            {'name': 'High-tech & Électronique', 'icon': 'Smartphone'},
            {'name': 'Maison & Bricolage', 'icon': 'Hammer'},
            {'name': 'Beauté & Cosmétiques', 'icon': 'Sparkles'},
            {'name': 'Livres & Culture', 'icon': 'BookOpen'},
        ],
    },
    {
        'name': 'Éducation', 'color': '#14b8a6', 'icon': 'GraduationCap',
        'children': [
            {'name': 'Frais de scolarité', 'icon': 'GraduationCap'},
            {'name': 'Fournitures & Livres scolaires', 'icon': 'BookOpen'},
            {'name': 'Formations & Cours', 'icon': 'School'},
        ],
    },
    {
        'name': 'Enfants & Famille', 'color': '#db2777', 'icon': 'Baby',
        'children': [
            {'name': 'Garde & Crèche', 'icon': 'Baby'},
            {'name': 'Activités enfants', 'icon': 'Blocks'},
            {'name': 'Vêtements enfants', 'icon': 'Shirt'},
            {'name': 'Argent de poche', 'icon': 'PiggyBank'},
        ],
    },
    {
        'name': 'Animaux', 'color': '#a16207', 'icon': 'PawPrint',
        'children': [
            {'name': 'Vétérinaire', 'icon': 'Stethoscope'},
            {'name': 'Alimentation animaux', 'icon': 'Bone'},
            {'name': 'Accessoires animaux', 'icon': 'PawPrint'},
        ],
    },
    {
        'name': 'Impôts & Taxes', 'color': '#64748b', 'icon': 'Landmark',
        'children': [
            {'name': 'Impôt sur le revenu', 'icon': 'Landmark'},
            {'name': 'Taxe foncière', 'icon': 'Landmark'},
            {'name': "Taxe d'habitation", 'icon': 'Landmark'},
            {'name': 'Autres taxes', 'icon': 'Receipt'},
        ],
    },
    {
        'name': 'Banque & Frais', 'color': '#a855f7', 'icon': 'CreditCard',
        'children': [
            {'name': 'Frais bancaires', 'icon': 'CreditCard'},
            {'name': 'Intérêts & Agios', 'icon': 'Percent'},
            {'name': 'Commissions', 'icon': 'Receipt'},
            {'name': 'Retrait espèces', 'icon': 'Banknote'},
        ],
    },
    {
        'name': 'Dons & Cadeaux', 'color': '#eab308', 'icon': 'Gift',
        'children': [
            {'name': 'Cadeaux', 'icon': 'Gift'},
            {'name': 'Dons & Charité', 'icon': 'HandHeart'},
        ],
    },
    {
        'name': 'Épargne & Investissements', 'color': '#84cc16', 'icon': 'PiggyBank',
        'children': [
            {'name': 'Épargne', 'icon': 'PiggyBank'},
            {'name': 'Investissements & Bourse', 'icon': 'TrendingUp'},
            {'name': 'Retraite', 'icon': 'Landmark'},
            {'name': 'Crypto', 'icon': 'Bitcoin'},
        ],
    },
    {
        'name': 'Revenus', 'color': '#10b981', 'icon': 'TrendingUp',
        'children': [
            {'name': 'Salaire', 'icon': 'Wallet'},
            {'name': 'Primes & Bonus', 'icon': 'Award'},
            {'name': 'Freelance & Honoraires', 'icon': 'Briefcase'},
            {'name': 'Revenus locatifs', 'icon': 'Building'},
            {'name': 'Allocations & Aides', 'icon': 'HandCoins'},
            {'name': 'Remboursements', 'icon': 'Undo2'},
            {'name': 'Intérêts & Dividendes', 'icon': 'TrendingUp'},
            {'name': 'Ventes', 'icon': 'Tag'},
        ],
    },
    {
        'name': 'Virements internes', 'color': '#0ea5e9', 'icon': 'ArrowLeftRight',
        'children': [],
    },
    {
        'name': 'Divers', 'color': '#94a3b8', 'icon': 'Tag',
        'children': [
            {'name': 'Non catégorisé', 'icon': 'CircleHelp'},
        ],
    },
]


def create_default_categories(user):
    """Crée (de façon idempotente) l'arbre de catégories par défaut pour ``user``.

    Retourne un dict ``{nom: Category}`` couvrant catégories principales et
    sous-catégories, pour faciliter les recherches par nom (ex. dans seed_demo).
    """
    from .models import Category

    created: dict[str, Category] = {}
    for parent_data in DEFAULT_CATEGORIES:
        parent, _ = Category.objects.get_or_create(
            user=user,
            name=parent_data['name'],
            parent=None,
            defaults={'color': parent_data['color'], 'icon': parent_data['icon']},
        )
        created[parent.name] = parent
        for child in parent_data.get('children', []):
            sub, _ = Category.objects.get_or_create(
                user=user,
                name=child['name'],
                parent=parent,
                defaults={
                    'color': child.get('color', parent_data['color']),
                    'icon': child.get('icon', parent_data['icon']),
                },
            )
            created[sub.name] = sub
    return created
