from rest_framework import serializers
from .models import BankRequisition, BankAccount, SyncLog


class SyncLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncLog
        fields = ('id', 'synced_at', 'transactions_added', 'status', 'error_message')
        read_only_fields = fields


class RecentSyncLogsField(serializers.SerializerMethodField):
    def to_representation(self, value):
        logs = value.sync_logs.all()[:5]
        return SyncLogSerializer(logs, many=True).data


class BankAccountSerializer(serializers.ModelSerializer):
    linked_account_name = serializers.SerializerMethodField()
    requisition_institution = serializers.SerializerMethodField()
    recent_sync_logs = RecentSyncLogsField(source='*')

    class Meta:
        model = BankAccount
        fields = (
            'id', 'account_id', 'iban', 'name', 'currency',
            'last_synced_at', 'linked_account', 'linked_account_name',
            'requisition', 'requisition_institution',
            'recent_sync_logs',
        )
        read_only_fields = (
            'id', 'account_id', 'iban', 'name', 'currency',
            'last_synced_at', 'requisition', 'requisition_institution',
            'recent_sync_logs',
        )

    def get_linked_account_name(self, obj):
        return obj.linked_account.name if obj.linked_account else None

    def get_requisition_institution(self, obj):
        return obj.requisition.institution_name


class BankRequisitionSerializer(serializers.ModelSerializer):
    bank_accounts = BankAccountSerializer(many=True, read_only=True)

    class Meta:
        model = BankRequisition
        fields = (
            'id', 'requisition_id', 'institution_id', 'institution_name',
            'institution_logo', 'status', 'reference',
            'created_at', 'bank_accounts',
        )
        read_only_fields = fields
