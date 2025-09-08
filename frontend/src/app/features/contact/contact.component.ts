import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

interface ContactData {
  name: string;
  email: string;
  phone?: string;
  inquiry: string;
  message: string;
}

interface SubscriptionData {
  name?: string;
  email: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="contact-container fade-in">
      <h2 class="section-title">
        <span class="section-icon"><i class="fas fa-envelope"></i></span>
        Contact Us
      </h2>
      <p class="section-tagline">
        We'd love to hear from you! Whether you have questions about our work, want to learn more about how your
        contributions are making a difference, or need assistance, feel free to reach out to us.
      </p>

      <div class="contact-flex">
        <!-- Contact Info Card -->
        <section class="contact-section contact-info-card">
          <h3>Our Office</h3>
          <div class="contact-info">
            <p><strong>Zakat Distribution Foundation</strong></p>
            <p>123 Charity Lane<br>Alexandria, VA, USA</p>
            <p>Email: <a href="mailto:info&#64;myzakat.org">info&#64;myzakat.org</a></p>
            <p>Phone: <a href="tel:+15551234567">+1 (555) 123-4567</a></p>
            
            <div class="footer-social">
              <a href="https://twitter.com/YOURHANDLE" target="_blank" aria-label="Twitter">
                <i class="fab fa-twitter"></i>
              </a>
              <a href="https://facebook.com/YOURPAGE" target="_blank" aria-label="Facebook">
                <i class="fab fa-facebook-f"></i>
              </a>
              <a href="https://instagram.com/YOURHANDLE" target="_blank" aria-label="Instagram">
                <i class="fab fa-instagram"></i>
              </a>
              <a href="https://linkedin.com/YOURPAGE" target="_blank" aria-label="LinkedIn">
                <i class="fab fa-linkedin-in"></i>
              </a>
              <a href="https://youtube.com/YOURCHANNEL" target="_blank" aria-label="YouTube">
                <i class="fab fa-youtube"></i>
              </a>
            </div>
            
            <div class="faq-link">
              <a href="/#faq"><i class="fas fa-question-circle"></i> Visit our FAQ</a>
            </div>
          </div>
          
          <div class="map-embed">
            <!-- Optional: Embed a map or static image here -->
            <!-- <iframe src="https://www.google.com/maps/embed?..." width="100%" height="180" style="border:0;" allowfullscreen="" loading="lazy"></iframe> -->
          </div>
        </section>

        <!-- Contact Form Card -->
        <section class="contact-section contact-form-card">
          <h3>Get in Touch</h3>
          
          <!-- Success Message -->
          <div *ngIf="showSuccessMessage" class="flash-message success">
            <p>Thank you! Your message has been sent successfully. We'll get back to you soon.</p>
          </div>
          
          <!-- Error Message -->
          <div *ngIf="showErrorMessage" class="flash-message error">
            <p>{{errorMessage}}</p>
          </div>
          
          <form (ngSubmit)="submitContactForm()" class="contact-form" #contactForm="ngForm">
            <div class="form-row">
              <div class="form-group">
                <label for="name">Your Name:</label>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  [(ngModel)]="contactData.name"
                  placeholder="Enter your name" 
                  required>
              </div>
              <div class="form-group">
                <label for="email">Your Email:</label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  [(ngModel)]="contactData.email"
                  placeholder="Enter your email" 
                  required>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="phone">Phone (optional):</label>
                <input 
                  type="tel" 
                  id="phone" 
                  name="phone" 
                  [(ngModel)]="contactData.phone"
                  placeholder="(optional)">
              </div>
              <div class="form-group">
                <label for="inquiry">Inquiry Type:</label>
                <select 
                  id="inquiry" 
                  name="inquiry" 
                  [(ngModel)]="contactData.inquiry"
                  required>
                  <option value="">Select...</option>
                  <option value="General">General</option>
                  <option value="Donation">Donation</option>
                  <option value="Volunteering">Volunteering</option>
                  <option value="Support">Support</option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label for="message">Your Message:</label>
              <textarea 
                id="message" 
                name="message" 
                [(ngModel)]="contactData.message"
                rows="5" 
                placeholder="Write your message here..." 
                required></textarea>
            </div>
            
            <button 
              type="submit" 
              class="submit-button"
              [disabled]="!contactForm.form.valid || isSubmitting">
              <span *ngIf="!isSubmitting">Send Message</span>
              <span *ngIf="isSubmitting">Sending...</span>
            </button>
          </form>
        </section>
      </div>

      <!-- Subscribe Section -->
      <section class="contact-section subscribe-section fade-in">
        <h3 class="section-title">
          <span class="section-icon"><i class="fas fa-bell"></i></span>
          Subscribe for Updates
        </h3>
        
        <!-- Subscription Success Message -->
        <div *ngIf="showSubscriptionSuccess" class="flash-message success">
          <p>Thank you for subscribing! You'll receive our latest updates.</p>
        </div>
        
        <!-- Subscription Error Message -->
        <div *ngIf="showSubscriptionError" class="flash-message error">
          <p>{{subscriptionErrorMessage}}</p>
        </div>
        
        <form (ngSubmit)="submitSubscription()" class="subscribe-form" #subscribeForm="ngForm">
          <div class="form-row">
            <div class="form-group">
              <label for="sub_name">Name (optional):</label>
              <input 
                type="text" 
                id="sub_name" 
                name="sub_name" 
                [(ngModel)]="subscriptionData.name"
                placeholder="Your name">
            </div>
            <div class="form-group">
              <label for="sub_email">Email:</label>
              <input 
                type="email" 
                id="sub_email" 
                name="sub_email" 
                [(ngModel)]="subscriptionData.email"
                placeholder="Your email" 
                required>
            </div>
          </div>
          <button 
            type="submit" 
            class="submit-button"
            [disabled]="!subscribeForm.form.valid || isSubscribing">
            <span *ngIf="!isSubscribing">Subscribe</span>
            <span *ngIf="isSubscribing">Subscribing...</span>
          </button>
        </form>
      </section>
    </div>
  `,
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent {
  contactData: ContactData = {
    name: '',
    email: '',
    phone: '',
    inquiry: '',
    message: ''
  };

  subscriptionData: SubscriptionData = {
    name: '',
    email: ''
  };

  isSubmitting = false;
  isSubscribing = false;
  showSuccessMessage = false;
  showErrorMessage = false;
  errorMessage = '';
  showSubscriptionSuccess = false;
  showSubscriptionError = false;
  subscriptionErrorMessage = '';

  constructor(private apiService: ApiService) {}

  submitContactForm() {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.showErrorMessage = false;
    this.showSuccessMessage = false;

    this.apiService.post('/contact/create', this.contactData).subscribe({
      next: (response) => {
        console.log('Contact form submitted:', response);
        this.showSuccessMessage = true;
        this.resetContactForm();
      },
      error: (error) => {
        console.error('Error submitting contact form:', error);
        this.errorMessage = 'There was an error sending your message. Please try again.';
        this.showErrorMessage = true;
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  submitSubscription() {
    if (this.isSubscribing) return;

    this.isSubscribing = true;
    this.showSubscriptionError = false;
    this.showSubscriptionSuccess = false;

    this.apiService.post('/subscriptions/create', this.subscriptionData).subscribe({
      next: (response) => {
        console.log('Subscription submitted:', response);
        this.showSubscriptionSuccess = true;
        this.resetSubscriptionForm();
      },
      error: (error) => {
        console.error('Error submitting subscription:', error);
        this.subscriptionErrorMessage = 'There was an error with your subscription. Please try again.';
        this.showSubscriptionError = true;
      },
      complete: () => {
        this.isSubscribing = false;
      }
    });
  }

  resetContactForm() {
    this.contactData = {
      name: '',
      email: '',
      phone: '',
      inquiry: '',
      message: ''
    };
  }

  resetSubscriptionForm() {
    this.subscriptionData = {
      name: '',
      email: ''
    };
  }
}
