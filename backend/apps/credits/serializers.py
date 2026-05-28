from rest_framework import serializers
from .models import Credit
from .services import calculate_credit_details


class CreditSerializer(serializers.ModelSerializer):
    total_cost = serializers.SerializerMethodField()
    total_interest = serializers.SerializerMethodField()
    remaining_months = serializers.SerializerMethodField()
    estimated_end_date = serializers.SerializerMethodField()
    total_monthly_charge = serializers.SerializerMethodField()

    class Meta:
        model = Credit
        fields = ('id', 'name', 'credit_type', 'initial_capital', 'remaining_capital',
                  'interest_rate', 'monthly_payment', 'insurance_monthly', 'duration_months',
                  'start_date', 'end_date', 'early_repayment_possible', 'notes', 'is_active',
                  'total_cost', 'total_interest', 'remaining_months', 'estimated_end_date',
                  'total_monthly_charge', 'created_at')
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

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
