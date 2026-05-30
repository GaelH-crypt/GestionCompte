from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from datetime import date, timedelta
import random
from decimal import Decimal

from apps.categories.models import Category
from apps.categories.defaults import create_default_categories
from apps.accounts.models import Account
from apps.transactions.models import Transaction
from apps.recurring.models import RecurringTransaction
from apps.credits.models import Credit


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
        categories = create_default_categories(user)

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
        # Lookup défensif : si une catégorie par défaut est renommée, on retombe
        # sur None (catégorie nullable) plutôt que de lever un KeyError.
        expense_cats = ['Courses', 'Carburant', 'Loisirs & Vacances', 'Santé', 'Restaurant']
        for i in range(60):
            tx_date = today - timedelta(days=i * 2)
            cat_name = expense_cats[i % len(expense_cats)]
            Transaction.objects.get_or_create(
                user=user, account=checking,
                description=f'{cat_name} #{i + 1}',
                date=tx_date, transaction_type='expense',
                defaults={
                    'amount': Decimal(str(round(random.uniform(15, 120), 2))),
                    'category': categories.get(cat_name),
                }
            )

        # Two months of salary — même catégorie que la charge récurrente "Salaire".
        for m in range(2):
            salary_date = today.replace(day=28) - timedelta(days=30 * m)
            Transaction.objects.get_or_create(
                user=user, account=checking,
                description=f'Salaire {salary_date.strftime("%B %Y")}',
                date=salary_date, transaction_type='income',
                defaults={'amount': Decimal('3200'), 'category': categories.get('Salaire')}
            )

        self.stdout.write('Seeding recurring transactions...')
        recurring_data = [
            ('Loyer', Decimal('900'), 'expense', 'monthly', today.replace(day=1), 'Loyer'),
            ('EDF', Decimal('85'), 'expense', 'monthly', today.replace(day=5), 'Électricité & Gaz'),
            ('Internet', Decimal('30'), 'expense', 'monthly', today.replace(day=10), 'Internet & Box'),
            ('Assurance voiture', Decimal('65'), 'expense', 'monthly', today.replace(day=15), 'Assurance auto'),
            ('Salaire', Decimal('3200'), 'income', 'monthly', today.replace(day=28), 'Salaire'),
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
