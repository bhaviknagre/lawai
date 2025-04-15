from django.urls import path
from .views import (
    TaskListCreateAPIView, TaskDetailAPIView,
    TaskStatusListCreateAPIView, TaskStatusDetailAPIView,
    TaskPriorityListCreateAPIView, TaskPriorityDetailAPIView
)

urlpatterns = [
    # Task
    path('', TaskListCreateAPIView.as_view(), name='task-list-create'),
    path('<int:pk>/', TaskDetailAPIView.as_view(), name='task-detail'),

    # Status
    path('status/', TaskStatusListCreateAPIView.as_view(), name='taskstatus-list-create'),
    path('status/<int:pk>/', TaskStatusDetailAPIView.as_view(), name='taskstatus-detail'),

    # Priority
    path('priority/', TaskPriorityListCreateAPIView.as_view(), name='taskpriority-list-create'),
    path('priority/<int:pk>/', TaskPriorityDetailAPIView.as_view(), name='taskpriority-detail'),
]
