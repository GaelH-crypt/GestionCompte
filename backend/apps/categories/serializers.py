from rest_framework import serializers
from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    subcategories = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'color', 'icon', 'parent', 'subcategories', 'created_at')
        read_only_fields = ('id', 'created_at', 'subcategories')

    def get_subcategories(self, obj):
        return CategorySerializer(obj.subcategories.all(), many=True).data

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
