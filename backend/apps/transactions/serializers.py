from rest_framework import serializers
from .models import Transaction


class TransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = Transaction
        fields = ('id', 'account', 'account_name', 'transaction_type', 'amount',
                  'category', 'category_name', 'description', 'date', 'is_recurring',
                  'note', 'tags', 'transfer_to_account', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at', 'category_name', 'account_name')

    def validate(self, data):
        if data.get('transaction_type') == 'transfer' and not data.get('transfer_to_account'):
            raise serializers.ValidationError({'transfer_to_account': 'Requis pour les virements.'})
        if data.get('amount', 0) <= 0:
            raise serializers.ValidationError({'amount': 'Le montant doit être positif.'})
        return data

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
