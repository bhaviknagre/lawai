from rest_framework import serializers
from .models import TaskStatus, TaskPriority, Task

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = '__all__'


class TaskStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskStatus
        fields = '__all__'

class TaskPrioritySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskPriority
        fields = '__all__'
