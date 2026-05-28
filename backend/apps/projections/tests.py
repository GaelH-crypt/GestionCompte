from decimal import Decimal
from django.test import TestCase


class ProjectionEngineTest(TestCase):
    def test_simple_projection(self):
        from apps.projections.engine import ProjectionEngine
        engine = ProjectionEngine(
            current_balance=Decimal('5000'),
            monthly_income=Decimal('3000'),
            monthly_expenses=Decimal('2000'),
            monthly_credits=Decimal('400'),
        )
        result = engine.project(months=3)
        self.assertEqual(len(result), 3)
        # After month 1: 5000 + (3000 - 2000 - 400) = 5600
        self.assertAlmostEqual(result[0]['balance'], 5600.0, places=1)
        # After month 2: 5600 + 600 = 6200
        self.assertAlmostEqual(result[1]['balance'], 6200.0, places=1)

    def test_override_income(self):
        from apps.projections.engine import ProjectionEngine
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('2000'),
            monthly_expenses=Decimal('1000'),
            monthly_credits=Decimal('0'),
            overrides={'income': Decimal('3000')},
        )
        result = engine.project(months=1)
        # 1000 + (3000 - 1000 - 0) = 3000
        self.assertAlmostEqual(result[0]['balance'], 3000.0, places=1)
