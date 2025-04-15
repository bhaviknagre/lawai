from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from .models import Case, CaseStatus, CaseType, PaymentStatus, OpposingParty, Court, Judge
from .serializers import (
    CaseSerializer, CaseStatusSerializer, CaseTypeSerializer,
    PaymentStatusSerializer, OpposingPartySerializer, CourtSerializer, JudgeSerializer
)


class CaseListCreateAPIView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        cases = Case.objects.all()
        serializer = CaseSerializer(cases, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        serializer = CaseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CaseDetailAPIView(APIView):
    permission_classes = [AllowAny]
    
    def get_object(self, pk):
        return get_object_or_404(Case, pk=pk)
    
    def get(self, request, pk):
        case = self.get_object(pk)
        serializer = CaseSerializer(case)
        return Response(serializer.data)
    
    def put(self, request, pk):
        case = self.get_object(pk)
        serializer = CaseSerializer(case, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        case = self.get_object(pk)
        case.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class CaseStatusListCreateAPIView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        status_list = CaseStatus.objects.all()
        serializer - CaseStatusSerializer(status_list, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        serializer = CaseStatusSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CaseStatusDetailAPIView(APIView):
    permission_classes = [AllowAny]
    
    def get_object(self, pk):
        return get_object_or_404(CaseStatus)
    
    def get(self, request, pk):
        status = self.get_object(pk)
        serializer = CaseStatusSerializer(status)
        return Response(serializer.data)
    
    def put(self, request, pk):
        status = self.get_object(pk)
        serializer = CaseStatusSerializer(status, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        status = self.get_object(pk)
        status.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class CaseTypeListCreateAPIView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, requets):
        case_type = CaseType.objects.all()
        serializer = CaseTypeSerializer(case_type, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        serializer = CaseTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CaseTypeDetailAPIView(APIView):
    permission_classes = [AllowAny]
    
    def get_object(self, pk):
        return get_object_or_404(CaseType, pk=pk)
    
    def get(self, request, pk):
        case_type = self.get_object(pk)
        serializer = CaseTypeSerializer(case_type)
        return Response(serializer.data)
    
    def put(self, request, pk):
        case_type = self.get_object(pk)
        serializer = CaseTypeSerializer(case_type, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        case_type = self.get_object(pk)
        case_type.delete 
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class PaymentStatusListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        payment_status = PaymentStatus.objects.all()
        serializer = PaymentStatusSerializer(payment_status, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PaymentStatusSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PaymentStatusDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(PaymentStatus, pk=pk)

    def get(self, request, pk):
        payment_status = self.get_object(pk)
        serializer = PaymentStatusSerializer(payment_status)
        return Response(serializer.data)

    def put(self, request, pk):
        payment_status = self.get_object(pk)
        serializer = PaymentStatusSerializer(payment_status, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        payment_status = self.get_object(pk)
        payment_status.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OpposingPartyListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        opposing_parties = OpposingParty.objects.all()
        serializer = OpposingPartySerializer(opposing_parties, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = OpposingPartySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OpposingPartyDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(OpposingParty, pk=pk)

    def get(self, request, pk):
        opposing_party = self.get_object(pk)
        serializer = OpposingPartySerializer(opposing_party)
        return Response(serializer.data)

    def put(self, request, pk):
        opposing_party = self.get_object(pk)
        serializer = OpposingPartySerializer(opposing_party, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        opposing_party = self.get_object(pk)
        opposing_party.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CourtListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        courts = Court.objects.all()
        serializer = CourtSerializer(courts, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CourtSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CourtDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(Court, pk=pk)

    def get(self, request, pk):
        court = self.get_object(pk)
        serializer = CourtSerializer(court)
        return Response(serializer.data)

    def put(self, request, pk):
        court = self.get_object(pk)
        serializer = CourtSerializer(court, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        court = self.get_object(pk)
        court.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class JudgeListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        judges = Judge.objects.all()
        serializer = JudgeSerializer(judges, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = JudgeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class JudgeDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(Judge, pk=pk)

    def get(self, request, pk):
        judge = self.get_object(pk)
        serializer = JudgeSerializer(judge)
        return Response(serializer.data)

    def put(self, request, pk):
        judge = self.get_object(pk)
        serializer = JudgeSerializer(judge, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        judge = self.get_object(pk)
        judge.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    