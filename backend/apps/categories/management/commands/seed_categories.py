from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from apps.categories.defaults import DEFAULT_CATEGORIES, create_default_categories


class Command(BaseCommand):
    help = "Provisionne l'arbre de catégories génériques par défaut pour les utilisateurs"

    def add_arguments(self, parser):
        parser.add_argument(
            '--user',
            help="Nom d'utilisateur cible. Par défaut : tous les utilisateurs.",
        )

    def handle(self, *args, **options):
        username = options.get('user')
        if username:
            users = list(User.objects.filter(username=username))
            if not users:
                self.stderr.write(self.style.ERROR(f"Utilisateur introuvable : {username}"))
                return
        else:
            users = list(User.objects.all())
            if not users:
                self.stderr.write(self.style.ERROR('Aucun utilisateur en base.'))
                return

        sub_count = sum(len(c.get('children', [])) for c in DEFAULT_CATEGORIES)
        total = len(DEFAULT_CATEGORIES) + sub_count

        for user in users:
            create_default_categories(user)
            self.stdout.write(f"  → {user.username} : {total} catégories assurées")

        self.stdout.write(self.style.SUCCESS(
            f"Catégories par défaut provisionnées pour {len(users)} utilisateur(s)."
        ))
