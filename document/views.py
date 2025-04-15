from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from .models import DocumentType, Document
from .serializers import DocumentTypeSerializer, DocumentSerializer




class DocumentTypeListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        types = DocumentType.objects.all()
        serializer = DocumentTypeSerializer(types, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = DocumentTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DocumentTypeDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(DocumentType, pk=pk)

    def put(self, request, pk):
        document_type = self.get_object(pk)
        serializer = DocumentTypeSerializer(document_type, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        document_type = self.get_object(pk)
        document_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        documents = Document.objects.all()
        serializer = DocumentSerializer(documents, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = DocumentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DocumentDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(Document, pk=pk)

    def put(self, request, pk):
        document = self.get_object(pk)
        serializer = DocumentSerializer(document, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        document = self.get_object(pk)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
