from django.contrib import admin
from .models import (
    DocumentType, Document, Chunk, DocumentEntities
)

# Register your models here.


admin.site.register(DocumentType)
admin.site.register(Document)
admin.site.register(Chunk)
admin.site.register(DocumentEntities)