from django.db import models
from lawyer.models import LawyerProfile
from client.models import Client


class CaseStatus(models.Model):
    name = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return self.name

class CaseType(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

class PaymentStatus(models.Model):
    status = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return self.status

class OpposingParty(models.Model):
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class Court(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.name

class Judge(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.name

class Case(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.ForeignKey(CaseStatus, on_delete=models.SET_NULL, null=True, related_name='cases')
    case_type = models.ForeignKey(CaseType, on_delete=models.SET_NULL, null=True, related_name='cases')
    lawyer = models.ForeignKey(LawyerProfile, on_delete=models.CASCADE, related_name='cases')
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='cases')
    opposing_party = models.ForeignKey(OpposingParty, on_delete=models.SET_NULL, null=True, related_name='cases')
    court = models.ForeignKey(Court, on_delete=models.SET_NULL, null=True, related_name='cases')
    judge = models.ForeignKey(Judge, on_delete=models.SET_NULL, null=True, related_name='cases')
    case_number = models.CharField(max_length=100, blank=True, null=True)
    filing_date = models.DateField(blank=True, null=True)
    closing_date = models.DateField(blank=True, null=True)
    payment_status = models.ForeignKey(PaymentStatus, on_delete=models.SET_NULL, null=True, related_name='cases')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.case_number})"