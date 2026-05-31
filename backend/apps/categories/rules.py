from apps.categories.defaults import DEFAULT_CATEGORIES
from apps.categories.models import Category, CategoryRule
from apps.transactions.models import Transaction

# name → {color, icon} pour les catégories auto-créées par le fallback statique
_CAT_DEFAULTS = {c['name']: {'color': c['color'], 'icon': c['icon']} for c in DEFAULT_CATEGORIES}


def match_rule(description: str, pattern: str, match_type: str) -> bool:
    d = description.upper()
    p = pattern.upper()
    if match_type == 'contains':
        return p in d
    if match_type == 'starts_with':
        return d.startswith(p)
    if match_type == 'exact':
        return d == p
    return False


def apply_rules(user, queryset) -> int:
    # Import local pour éviter la dépendance circulaire categories → imports
    from apps.imports.services.categorizer import suggest_category

    rules = list(CategoryRule.objects.filter(user=user).select_related('category'))
    cat_cache: dict[str, Category] = {}
    to_update: list[Transaction] = []

    for tx in queryset.filter(category=None):
        matched = False
        for rule in rules:
            if match_rule(tx.description, rule.pattern, rule.match_type):
                tx.category = rule.category
                to_update.append(tx)
                matched = True
                break

        if not matched:
            cat_name = suggest_category(tx.description)
            if cat_name:
                if cat_name not in cat_cache:
                    defaults = _CAT_DEFAULTS.get(cat_name, {'color': '#6366f1', 'icon': 'Tag'})
                    cat, _ = Category.objects.get_or_create(
                        user=user,
                        name=cat_name,
                        parent=None,
                        defaults=defaults,
                    )
                    cat_cache[cat_name] = cat
                tx.category = cat_cache[cat_name]
                to_update.append(tx)

    if to_update:
        Transaction.objects.bulk_update(to_update, ['category'])

    return len(to_update)
