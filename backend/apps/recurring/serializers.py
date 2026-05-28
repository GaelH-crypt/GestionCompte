from rest_framework import serializers
from .models import RecurringTransaction


class RecurringTransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = RecurringTransaction
        fields = ('id', 'name', 'amount', 'transaction_type', 'frequency', 'next_occurrence',
                  'category', 'category_name', 'account', 'account_name', 'is_active', 'note', 'created_at')
        read_only_fields = ('id', 'created_at', 'category_name', 'account_name')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
