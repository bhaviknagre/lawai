from rest_framework import serializers
from .models import(
    Case, CaseStatus, CaseType, PaymentStatus, OpposingParty, Court, Judge
)

class CaseStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseStatus
        fields = '__all__'
        
class CaseTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseType
        fields = '__all__'

class PaymentStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentStatus
        fields = '__all__'

class OpposingPartySerializer(serializers.ModelSerializer):
    class Meta:
        model = OpposingParty
        fields = '__all__'

class CourtSerializer(serializers.ModelSerializer):
    class Meta:
        model = Court
        fields = '__all__'
        
class JudgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Judge
        fields = '__all__'
        
class CaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = '__all__'