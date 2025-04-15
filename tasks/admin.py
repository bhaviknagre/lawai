from django.contrib import admin
from .models import (
    TaskStatus, TaskPriority, Task
)
# Register your models here.

admin.site.register(TaskStatus)
admin.site.register(TaskPriority)
admin.site.register(Task)