from django.contrib import admin
from .models import (
    CaseStatus, CaseType, PaymentStatus, OpposingParty, Court, Judge, Case
)

# Register your models here.


admin.site.register(CaseStatus)
admin.site.register(CaseType)
admin.site.register(PaymentStatus)
admin.site.register(OpposingParty)
admin.site.register(Court)
admin.site.register(Judge)
admin.site.register(Case)