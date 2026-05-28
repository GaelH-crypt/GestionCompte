from rest_framework import serializers
from .models import Account
from .services import get_account_balance


class AccountSerializer(serializers.ModelSerializer):
    current_balance = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = ('id', 'name', 'account_type', 'initial_balance', 'current_balance',
                  'color', 'icon', 'is_active', 'created_at')
        read_only_fields = ('id', 'created_at', 'current_balance')

    def get_current_balance(self, obj):
        return get_account_balance(obj)

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
