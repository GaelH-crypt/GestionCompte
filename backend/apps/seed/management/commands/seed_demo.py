from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from datetime import date, timedelta
import random
from decimal import Decimal

from apps.categories.models import Category
from apps.accounts.models import Account
from apps.transactions.models import Transaction
from apps.recurring.models import RecurringTransaction
from apps.credits.models import Credit


CATEGORIES_DATA = [
    ('Alimentation', '#22c55e', 'ShoppingCart'),
    ('Logement', '#3b82f6', 'Home'),
    ('Carburant', '#f59e0b', 'Fuel'),
    ('Assurances', '#8b5cf6', 'Shield'),
    ('Enfants', '#ec4899', 'Baby'),
    ('Loisirs', '#06b6d4', 'Gamepad2'),
    ('Santé', '#ef4444', 'Heart'),
    ('Abonnements', '#6366f1', 'Repeat'),
    ('Impôts', '#64748b', 'Landmark'),
    ('Revenus', '#10b981', 'TrendingUp'),
]


class Command(BaseCommand):
    help = 'Seed demo data for GestionCompte'

    def add_arguments(self, parser):
        parser.add_argument('--flush', action='store_true', help='Clear existing data first')

    def handle(self, *args, **options):
        user = User.objects.filter(is_superuser=True).first()
        if not user:
            self.stderr.write(self.style.ERROR('No admin user found. Run create_admin first.'))
            return

        if options['flush']:
            Transaction.objects.filter(user=user).delete()
            RecurringTransaction.objects.filter(user=user).delete()
            Credit.objects.filter(user=user).delete()
            Account.objects.filter(user=user).delete()
            Category.objects.filter(user=user).delete()
            self.stdout.write('Existing data cleared.')

        self.stdout.write('Seeding categories...')
        categories = {}
        for name, color, icon in CATEGORIES_DATA:
            cat, _ = Category.objects.get_or_create(
                user=user, name=name, parent=None,
                defaults={'color': color, 'icon': icon}
            )
            categories[name] = cat

        self.stdout.write('Seeding accounts...')
        checking, _ = Account.objects.get_or_create(
            user=user, name='Compte Courant',
            defaults={'account_type': 'checking', 'initial_balance': Decimal('2500'),
                      'color': '#3b82f6', 'icon': 'CreditCard'}
        )
        savings, _ = Account.objects.get_or_create(
            user=user, name='Livret A',
            defaults={'account_type': 'savings', 'initial_balance': Decimal('8000'),
                      'color': '#22c55e', 'icon': 'PiggyBank'}
        )

        self.stdout.write('Seeding transactions...')
        today = date.today()
        expense_cats = ['Alimentation', 'Carburant', 'Loisirs', 'Santé', 'Abonnements']
        for i in range(60):
            tx_date = today - timedelta(days=i * 2)
            cat_name = expense_cats[i % len(expense_cats)]
            Transaction.objects.get_or_create(
                user=user, account=checking,
                description=f'{cat_name} #{i + 1}',
                date=tx_date, transaction_type='expense',
                defaults={
                    'amount': Decimal(str(round(random.uniform(15, 120), 2))),
                    'category': categories[cat_name],
                }
            )

        # Two months of salary
        for m in range(2):
            salary_date = today.replace(day=28) - timedelta(days=30 * m)
            Transaction.objects.get_or_create(
                user=user, account=checking,
                description=f'Salaire {salary_date.strftime("%B %Y")}',
                date=salary_date, transaction_type='income',
                defaults={'amount': Decimal('3200'), 'category': categories['Revenus']}
            )

        self.stdout.write('Seeding recurring transactions...')
        recurring_data = [
            ('Loyer', Decimal('900'), 'expense', 'monthly', today.replace(day=1), 'Logement'),
            ('EDF', Decimal('85'), 'expense', 'monthly', today.replace(day=5), 'Logement'),
            ('Internet', Decimal('30'), 'expense', 'monthly', today.replace(day=10), 'Abonnements'),
            ('Assurance voiture', Decimal('65'), 'expense', 'monthly', today.replace(day=15), 'Assurances'),
            ('Salaire', Decimal('3200'), 'income', 'monthly', today.replace(day=28), None),
        ]
        for name, amount, tx_type, freq, next_occ, cat_name in recurring_data:
            RecurringTransaction.objects.get_or_create(
                user=user, name=name,
                defaults={
                    'amount': amount, 'transaction_type': tx_type, 'frequency': freq,
                    'next_occurrence': next_occ,
                    'category': categories.get(cat_name) if cat_name else None,
                    'account': checking,
                }
            )

        self.stdout.write('Seeding credits...')
        Credit.objects.get_or_create(
            user=user, name='Crédit Immobilier',
            defaults={
                'credit_type': 'mortgage',
                'initial_capital': Decimal('180000'),
                'remaining_capital': Decimal('145000'),
                'interest_rate': Decimal('2.10'),
                'monthly_payment': Decimal('850'),
                'insurance_monthly': Decimal('45'),
                'duration_months': 240,
                'start_date': date(2019, 3, 1),
            }
        )
        Credit.objects.get_or_create(
            user=user, name='Crédit Auto',
            defaults={
                'credit_type': 'auto',
                'initial_capital': Decimal('15000'),
                'remaining_capital': Decimal('9500'),
                'interest_rate': Decimal('4.50'),
                'monthly_payment': Decimal('285'),
                'insurance_monthly': Decimal('18'),
                'duration_months': 60,
                'start_date': date(2023, 6, 1),
            }
        )

        self.stdout.write(self.style.SUCCESS('Demo data seeded successfully.'))
