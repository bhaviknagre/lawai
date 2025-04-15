from django.db import models
from lawyer.models import LawyerProfile  

class DocumentType(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

class Document(models.Model):
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='documents/')
    document_type = models.ForeignKey(DocumentType, on_delete=models.SET_NULL, null=True, related_name='documents')
    case = models.ForeignKey('cases.Case', on_delete=models.CASCADE, related_name='documents')
    uploaded_by = models.ForeignKey(LawyerProfile, on_delete=models.SET_NULL, null=True, related_name='uploaded_documents')  # ✅ Updated
    description = models.TextField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class Chunk(models.Model):
    text = models.TextField()
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='chunks')

    def __str__(self):
        return f"Chunk {self.id} - {self.document.title}"

class DocumentEntities(models.Model):
    attribute = models.CharField(max_length=255)
    value = models.TextField()
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='entities')
    chunk = models.ForeignKey(Chunk, on_delete=models.CASCADE, related_name='entities')

    def __str__(self):
        return f"{self.attribute}: {self.value}"
