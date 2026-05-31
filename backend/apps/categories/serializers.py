from rest_framework import serializers
from .models import Category, CategoryRule


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


class CategoryRuleSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = CategoryRule
        fields = ('id', 'pattern', 'match_type', 'category', 'category_name', 'order', 'created_at')
        read_only_fields = ('id', 'created_at', 'category_name')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

    def validate_category(self, value):
        if value.user != self.context['request'].user:
            raise serializers.ValidationError("Catégorie inaccessible.")
        return value
