from django.contrib.auth.models import User
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import LawyerProfile
from .serializers import LawyerProfileSerializer, Loginserializer, UserSerializer

class RegisterApi(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user_serializer = UserSerializer(data=request.data)
        if user_serializer.is_valid():
            user = User.objects.create_user(
                username=user_serializer.validated_data['username'],
                email=user_serializer.validated_data['email'],
                password=request.data['password']
            )
            LawyerProfile.objects.create(user=user)
            return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
        return Response(user_serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginApi(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = Loginserializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            return Response({"message": f"Welcome {user.username}!"}, status=status.HTTP_200_OK)
        return Response({"error": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


class LogoutApi(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        return Response({"message": "Logout successful"}, status=status.HTTP_200_OK)


class UpdateProfileApi(APIView):
    permission_classes = [AllowAny]

    def put(self, request):
        username = request.data.get('username')
        try:
            user = User.objects.get(username=username)
            lawyer_profile, created = LawyerProfile.objects.get_or_create(user=user)
            serializer = LawyerProfileSerializer(lawyer_profile, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response({"message": "Profile updated successfully."})
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)


class DeleteAccountApi(APIView):
    permission_classes = [AllowAny]

    def delete(self, request):
        username = request.data.get('username')
        try:
            user = User.objects.get(username=username)
            try:
                user.lawyerprofile.delete()
            except LawyerProfile.DoesNotExist:
                pass
            user.delete()
            return Response({"message": "User account deleted successfully."}, status=status.HTTP_204_NO_CONTENT)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)


class LawyerProfileViewSet(viewsets.ModelViewSet):
    queryset = LawyerProfile.objects.all()
    serializer_class = LawyerProfileSerializer
    permission_classes = [AllowAny]
