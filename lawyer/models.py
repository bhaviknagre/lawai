from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator


class LawyerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    mobile_number = models.CharField(max_length=15, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    bar_association_id = models.CharField(max_length=50, blank=True, null=True)
    specialization = models.CharField(max_length=100, blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    profile_picture = models.ImageField(upload_to='lawyer_profiles/', blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    joined_date = models.DateField(auto_now_add=True)
    years_of_experience = models.IntegerField(validators=[MinValueValidator(0)], blank=True, null=True)
    total_cases_handled = models.IntegerField(validators=[MinValueValidator(0)], default=0)
    languages_spoken = models.CharField(max_length=255, blank=True, null=True)
    rating = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    last_active = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.specialization or 'General'})"