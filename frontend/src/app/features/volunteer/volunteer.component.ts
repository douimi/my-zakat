import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

interface VolunteerData {
  name: string;
  email: string;
  interest: string;
}

@Component({
  selector: 'app-volunteer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Volunteer Hero Section -->
    <section class="volunteer-section">
      <h2>Join Us as a Volunteer</h2>
      <p>Make a difference in the lives of those in need by offering your time and skills.</p>

      <!-- Horizontal Volunteer Cards -->
      <div class="volunteer-container">
        <div class="volunteer-box">
          <img src="assets/images/volunteer.jpg" alt="Community Outreach">
          <h3>Community Outreach</h3>
          <p>Help distribute food, water, and essential supplies to those in need.</p>
        </div>
        <div class="volunteer-box">
          <img src="assets/images/outreach_coordinator.jpg" alt="Event Coordinator">
          <h3>Event Coordination</h3>
          <p>Assist in organizing fundraising events and awareness campaigns.</p>
        </div>
        <div class="volunteer-box">
          <img src="assets/images/fundraiser.jpg" alt="Fundraising">
          <h3>Fundraising & Donations</h3>
          <p>Support fundraising efforts to help sustain our mission and programs.</p>
        </div>
      </div>
    </section>

    <!-- Volunteer Signup Form -->
    <section class="volunteer-section">
      <h3>Volunteer Sign-Up</h3>
      <form (ngSubmit)="submitVolunteerForm()" class="zakat-form" #volunteerForm="ngForm">
        <div class="form-row">
          <div class="form-group">
            <label for="name">Full Name:</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              [(ngModel)]="volunteerData.name"
              placeholder="Enter your full name" 
              required>
          </div>
          <div class="form-group">
            <label for="email">Email Address:</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              [(ngModel)]="volunteerData.email"
              placeholder="Enter your email" 
              required>
          </div>
        </div>
        <div class="form-group">
          <label for="interest">Area of Interest:</label>
          <select 
            id="interest" 
            name="interest" 
            [(ngModel)]="volunteerData.interest"
            required>
            <option value="">Select...</option>
            <option value="Outreach">Community Outreach</option>
            <option value="Event">Event Coordination</option>
            <option value="Fundraising">Fundraising & Donations</option>
          </select>
        </div>
        <div class="form-actions">
          <button 
            type="submit" 
            [disabled]="!volunteerForm.form.valid || isSubmitting"
            class="submit-btn">
            <span *ngIf="!isSubmitting">Sign Up</span>
            <span *ngIf="isSubmitting">Submitting...</span>
          </button>
        </div>
      </form>

      <!-- Success Message -->
      <div *ngIf="showSuccessMessage" class="success-message">
        <h3>Thank You!</h3>
        <p>Your volunteer application has been submitted successfully. We'll be in touch soon!</p>
      </div>

      <!-- Error Message -->
      <div *ngIf="showErrorMessage" class="error-message">
        <p>{{errorMessage}}</p>
        <button (click)="showErrorMessage = false" class="close-btn">&times;</button>
      </div>
    </section>
  `,
  styleUrls: ['./volunteer.component.scss']
})
export class VolunteerComponent {
  volunteerData: VolunteerData = {
    name: '',
    email: '',
    interest: ''
  };

  isSubmitting = false;
  showSuccessMessage = false;
  showErrorMessage = false;
  errorMessage = '';

  constructor(private apiService: ApiService) {}

  submitVolunteerForm() {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.showErrorMessage = false;
    this.showSuccessMessage = false;

    this.apiService.post('/volunteers/create', this.volunteerData).subscribe({
      next: (response) => {
        console.log('Volunteer application submitted:', response);
        this.showSuccessMessage = true;
        this.resetForm();
      },
      error: (error) => {
        console.error('Error submitting volunteer application:', error);
        this.errorMessage = 'There was an error submitting your application. Please try again.';
        this.showErrorMessage = true;
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  resetForm() {
    this.volunteerData = {
      name: '',
      email: '',
      interest: ''
    };
  }
}
