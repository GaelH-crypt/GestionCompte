from rest_framework import serializers
from .models import RecurringTransaction
from apps.accounts.models import Account
from apps.categories.models import Category
from apps.credits.models import Credit


class RecurringTransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    credit_name = serializers.CharField(source='credit.name', read_only=True, allow_null=True)

    class Meta:
        model = RecurringTransaction
        fields = (
            'id', 'name', 'amount', 'transaction_type', 'frequency', 'next_occurrence',
            'category', 'category_name', 'account', 'account_name',
            'credit', 'credit_name',
            'is_active', 'note', 'created_at',
        )
        read_only_fields = ('id', 'created_at', 'category_name', 'account_name', 'credit_name')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['account'].queryset = Account.objects.filter(user=request.user)
            self.fields['category'].queryset = Category.objects.filter(user=request.user)
            self.fields['credit'].queryset = Credit.objects.filter(user=request.user)

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

    def validate_credit(self, value):
        if value is not None and value.user != self.context['request'].user:
            raise serializers.ValidationError("Invalid credit.")
        return value
