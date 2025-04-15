from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from .models import Task, TaskStatus, TaskPriority
from .serializers import TaskSerializer, TaskStatusSerializer, TaskPrioritySerializer




class TaskStatusListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        statuses = TaskStatus.objects.all()
        serializer = TaskStatusSerializer(statuses, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TaskStatusSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TaskStatusDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(TaskStatus, pk=pk)

    def put(self, request, pk):
        status_obj = self.get_object(pk)
        serializer = TaskStatusSerializer(status_obj, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        status_obj = self.get_object(pk)
        status_obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskPriorityListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        priorities = TaskPriority.objects.all()
        serializer = TaskPrioritySerializer(priorities, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TaskPrioritySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TaskPriorityDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(TaskPriority, pk=pk)

    def put(self, request, pk):
        priority = self.get_object(pk)
        serializer = TaskPrioritySerializer(priority, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        priority = self.get_object(pk)
        priority.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskListCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        tasks = Task.objects.all()
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TaskSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TaskDetailAPIView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, pk):
        return get_object_or_404(Task, pk=pk)

    def put(self, request, pk):
        task = self.get_object(pk)
        serializer = TaskSerializer(task, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        task = self.get_object(pk)
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
