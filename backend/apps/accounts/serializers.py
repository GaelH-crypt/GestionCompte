from rest_framework import serializers
from apps.credits.models import Credit
from .models import Account
from .services import get_account_balance


class AccountSerializer(serializers.ModelSerializer):
    current_balance = serializers.SerializerMethodField()
    linked_credit = serializers.PrimaryKeyRelatedField(
        # Default to none() — any submitted PK will fail with "Invalid pk" which
        # is the correct safe behaviour when no request context is available.
        # The queryset is narrowed to the authenticated user's credits in __init__.
        queryset=Credit.objects.none(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Account
        fields = (
            'id', 'name', 'account_type', 'initial_balance', 'current_balance',
            'color', 'icon', 'is_active', 'is_import_ignored', 'exclude_from_total',
            'linked_credit', 'created_at',
        )
        read_only_fields = ('id', 'created_at', 'current_balance')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request:
            self.fields['linked_credit'].queryset = Credit.objects.filter(user=request.user)

    def get_current_balance(self, obj):
        return get_account_balance(obj)

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
