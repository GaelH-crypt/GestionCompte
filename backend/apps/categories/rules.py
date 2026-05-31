from apps.categories.models import CategoryRule, Category
from apps.imports.services.categorizer import suggest_category


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
    rules = list(CategoryRule.objects.filter(user=user).select_related('category'))
    count = 0

    for tx in queryset.filter(category=None):
        matched = False
        for rule in rules:
            if match_rule(tx.description, rule.pattern, rule.match_type):
                tx.category = rule.category
                tx.save(update_fields=['category'])
                count += 1
                matched = True
                break

        if not matched:
            cat_name = suggest_category(tx.description)
            if cat_name:
                cat, _ = Category.objects.get_or_create(
                    user=user,
                    name=cat_name,
                    parent=None,
                    defaults={'color': '#6366f1', 'icon': 'Tag'},
                )
                tx.category = cat
                tx.save(update_fields=['category'])
                count += 1

    return count
