from decimal import Decimal
from rest_framework import serializers
from .models import Credit, CreditDraw
from .services import calculate_credit_details


class CreditDrawSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditDraw
        fields = ('id', 'amount', 'monthly_payment', 'duration_months',
                  'start_date', 'is_active', 'notes', 'created_at')
        read_only_fields = ('id', 'created_at')


class CreditSerializer(serializers.ModelSerializer):
    total_cost = serializers.SerializerMethodField()
    total_interest = serializers.SerializerMethodField()
    remaining_months = serializers.SerializerMethodField()
    estimated_end_date = serializers.SerializerMethodField()
    total_monthly_charge = serializers.SerializerMethodField()
    draws = CreditDrawSerializer(many=True, read_only=True)
    available_capacity = serializers.SerializerMethodField()
    linked_accounts = serializers.SerializerMethodField()

    class Meta:
        model = Credit
        fields = (
            'id', 'name', 'credit_type', 'initial_capital', 'remaining_capital',
            'interest_rate', 'monthly_payment', 'insurance_monthly', 'duration_months',
            'start_date', 'end_date', 'max_amount', 'early_repayment_possible',
            'notes', 'is_active',
            'total_cost', 'total_interest', 'remaining_months', 'estimated_end_date',
            'total_monthly_charge', 'draws', 'available_capacity', 'linked_accounts',
            'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def _details(self, obj):
        if not hasattr(obj, '_details_cache'):
            obj._details_cache = calculate_credit_details(obj)
        return obj._details_cache

    def get_total_cost(self, obj): return self._details(obj)['total_cost']
    def get_total_interest(self, obj): return self._details(obj)['total_interest']
    def get_remaining_months(self, obj): return self._details(obj)['remaining_months']
    def get_estimated_end_date(self, obj): return self._details(obj)['estimated_end_date']
    def get_total_monthly_charge(self, obj): return self._details(obj)['total_monthly_charge']

    def get_available_capacity(self, obj):
        if obj.credit_type != 'revolving' or obj.max_amount is None:
            return None
        used = sum(
            Decimal(str(d.amount)) for d in obj.draws.filter(is_active=True)
        )
        return float(Decimal(str(obj.max_amount)) - used)

    def get_linked_accounts(self, obj):
        return [
            {'id': a.id, 'name': a.name}
            for a in obj.accounts.all()
        ]

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
