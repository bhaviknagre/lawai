from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from .models import LawyerProfile

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']

class LawyerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()  

    class Meta:
        model = LawyerProfile
        fields = '__all__'

    def create(self, validated_data):
        user_data = validated_data.pop('user')
        user = User.objects.create_user(**user_data) 
        lawyer_profile = LawyerProfile.objects.create(user=user, **validated_data)
        return lawyer_profile

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', None)
        if user_data:
            for attr, value in user_data.items():
                setattr(instance.user, attr, value)
            instance.user.save()

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance  

class Loginserializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')
        user = authenticate(username=username, password=password)

        if not user:
            raise serializers.ValidationError("Invalid username or password.")
        
        data['user'] = user
        return data
