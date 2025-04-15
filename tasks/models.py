from django.db import models
from django.contrib.auth.models import User  

class TaskStatus(models.Model):
    name = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return self.name

class TaskPriority(models.Model):
    level = models.CharField(max_length=10, unique=True)

    def __str__(self):
        return self.level

class Task(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    case = models.ForeignKey('cases.Case', on_delete=models.CASCADE, related_name='tasks')
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE, related_name='assigned_tasks')
    due_date = models.DateField(blank=True, null=True)
    status = models.ForeignKey(TaskStatus, on_delete=models.SET_NULL, null=True, related_name='tasks')
    priority = models.ForeignKey(TaskPriority, on_delete=models.SET_NULL, null=True, related_name='tasks')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
