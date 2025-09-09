import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

interface Testimonial {
  id?: number;
  name: string;
  message: string;
  rating: number;
  image_url?: string;
  video_url?: string;
  location?: string;
  is_approved: boolean;
  is_featured: boolean;
  created_at?: string;
}

@Component({
  selector: 'app-testimonials-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Testimonial Management</h1>
        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="fas fa-plus"></i> Add Testimonial
        </button>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button class="tab-button" 
                [class.active]="activeFilter === 'all'"
                (click)="setActiveFilter('all')">
          All Testimonials
        </button>
        <button class="tab-button" 
                [class.active]="activeFilter === 'approved'"
                (click)="setActiveFilter('approved')">
          Approved
        </button>
        <button class="tab-button" 
                [class.active]="activeFilter === 'pending'"
                (click)="setActiveFilter('pending')">
          Pending Approval
        </button>
        <button class="tab-button" 
                [class.active]="activeFilter === 'featured'"
                (click)="setActiveFilter('featured')">
          Featured
        </button>
      </div>

      <!-- Testimonials Grid -->
      <div class="testimonials-grid">
        <div *ngFor="let testimonial of filteredTestimonials" 
             class="testimonial-card" 
             [class.pending]="!testimonial.is_approved"
             [class.featured]="testimonial.is_featured">
          
          <div class="testimonial-header">
            <div class="user-info">
              <img *ngIf="testimonial.image_url" [src]="testimonial.image_url" [alt]="testimonial.name" class="user-avatar">
              <div class="user-avatar placeholder" *ngIf="!testimonial.image_url">
                <i class="fas fa-user"></i>
              </div>
              <div class="user-details">
                <h4>{{testimonial.name}}</h4>
                <p *ngIf="testimonial.location">{{testimonial.location}}</p>
                <div class="rating">
                  <i *ngFor="let star of getStars(testimonial.rating)" 
                     class="fas fa-star" 
                     [class.filled]="star <= testimonial.rating"></i>
                </div>
              </div>
            </div>
            
            <div class="testimonial-badges">
              <span class="badge featured" *ngIf="testimonial.is_featured">
                <i class="fas fa-star"></i> Featured
              </span>
              <span class="badge" [class.approved]="testimonial.is_approved" [class.pending]="!testimonial.is_approved">
                {{testimonial.is_approved ? 'Approved' : 'Pending'}}
              </span>
            </div>
          </div>

          <div class="testimonial-content">
            <p>{{testimonial.message}}</p>
            
            <div class="media-preview" *ngIf="testimonial.video_url">
              <video [src]="testimonial.video_url" controls></video>
              <div class="media-label">
                <i class="fas fa-video"></i> Video Testimonial
              </div>
            </div>
          </div>

          <div class="testimonial-actions">
            <button class="btn-icon btn-edit" (click)="editTestimonial(testimonial)" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon" 
                    [class.btn-approve]="!testimonial.is_approved"
                    [class.btn-unapprove]="testimonial.is_approved"
                    (click)="toggleApproval(testimonial)" 
                    [title]="testimonial.is_approved ? 'Unapprove' : 'Approve'">
              <i class="fas" [class.fa-check]="!testimonial.is_approved" [class.fa-times]="testimonial.is_approved"></i>
            </button>
            <button class="btn-icon btn-feature" 
                    (click)="toggleFeatured(testimonial)" 
                    [title]="testimonial.is_featured ? 'Remove from Featured' : 'Add to Featured'">
              <i class="fas fa-star" [class.featured]="testimonial.is_featured"></i>
            </button>
            <button class="btn-icon btn-delete" (click)="deleteTestimonial(testimonial)" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>

          <div class="testimonial-meta">
            <small>Added {{formatDate(testimonial.created_at)}}</small>
          </div>
        </div>
      </div>

      <!-- Add/Edit Modal -->
      <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{isEditing ? 'Edit Testimonial' : 'Add New Testimonial'}}</h2>
            <button class="btn-close" (click)="closeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <form [formGroup]="testimonialForm" (ngSubmit)="saveTestimonial()">
            <div class="form-grid">
              <div class="form-group">
                <label for="name">Name *</label>
                <input type="text" id="name" formControlName="name" class="form-control">
                <div class="error-message" *ngIf="testimonialForm.get('name')?.touched && testimonialForm.get('name')?.errors">
                  Name is required
                </div>
              </div>

              <div class="form-group">
                <label for="location">Location</label>
                <input type="text" id="location" formControlName="location" class="form-control">
              </div>

              <div class="form-group full-width">
                <label for="message">Message *</label>
                <textarea id="message" formControlName="message" rows="4" class="form-control"></textarea>
                <div class="error-message" *ngIf="testimonialForm.get('message')?.touched && testimonialForm.get('message')?.errors">
                  Message is required
                </div>
              </div>

              <div class="form-group">
                <label for="rating">Rating *</label>
                <select id="rating" formControlName="rating" class="form-control">
                  <option value="5">5 Stars - Excellent</option>
                  <option value="4">4 Stars - Very Good</option>
                  <option value="3">3 Stars - Good</option>
                  <option value="2">2 Stars - Fair</option>
                  <option value="1">1 Star - Poor</option>
                </select>
              </div>

              <div class="form-group">
                <label for="image_url">Profile Image URL</label>
                <input type="url" id="image_url" formControlName="image_url" class="form-control">
                <small class="form-text">URL to user's profile photo</small>
              </div>

              <div class="form-group full-width">
                <label for="video_url">Video Testimonial URL</label>
                <input type="url" id="video_url" formControlName="video_url" class="form-control">
                <small class="form-text">URL to video testimonial (optional)</small>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" formControlName="is_approved">
                  <span class="checkmark"></span>
                  Approved
                </label>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" formControlName="is_featured">
                  <span class="checkmark"></span>
                  Featured
                </label>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="testimonialForm.invalid || isLoading">
                <i class="fas fa-spinner fa-spin" *ngIf="isLoading"></i>
                {{isEditing ? 'Update Testimonial' : 'Add Testimonial'}}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading testimonials...</p>
      </div>
    </div>
  `,
  styleUrls: ['./testimonials-management.component.scss']
})
export class TestimonialsManagementComponent implements OnInit {
  testimonials: Testimonial[] = [];
  filteredTestimonials: Testimonial[] = [];
  showModal = false;
  isEditing = false;
  loading = true;
  isLoading = false;
  currentTestimonial: Testimonial | null = null;
  activeFilter = 'all';

  testimonialForm: FormGroup;

  constructor(
    private apiService: ApiService,
    private fb: FormBuilder
  ) {
    this.testimonialForm = this.fb.group({
      name: ['', [Validators.required]],
      message: ['', [Validators.required]],
      rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
      image_url: [''],
      video_url: [''],
      location: [''],
      is_approved: [true],
      is_featured: [false]
    });
  }

  ngOnInit() {
    this.loadTestimonials();
  }

  loadTestimonials() {
    this.loading = true;
    
    // Sample data for development
    setTimeout(() => {
      this.testimonials = [
        {
          id: 1,
          name: "Ahmed Hassan",
          message: "The support I received from this foundation changed my family's life. During our most difficult time, they provided not just financial help but emotional support too.",
          rating: 5,
          image_url: "assets/images/testimonials/person1.jpg",
          location: "Toronto, Canada",
          is_approved: true,
          is_featured: true,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          name: "Sarah Khan",
          message: "I'm grateful for the educational scholarship that allowed my daughter to continue her studies. This foundation truly cares about making a difference.",
          rating: 5,
          image_url: "assets/images/testimonials/person2.jpeg",
          location: "Vancouver, BC",
          is_approved: true,
          is_featured: false,
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 3,
          name: "Omar Ali",
          message: "The medical assistance program helped me get the treatment I needed when I couldn't afford it. The staff was compassionate and understanding.",
          rating: 5,
          video_url: "assets/videos/testimonial1.mp4",
          location: "Calgary, AB",
          is_approved: false,
          is_featured: false,
          created_at: new Date(Date.now() - 172800000).toISOString()
        },
        {
          id: 4,
          name: "Fatima Mohamed",
          message: "Excellent service and genuine care for the community. They helped us during Ramadan with food packages and continued support throughout the year.",
          rating: 4,
          image_url: "assets/images/testimonials/person3.jpg",
          location: "Montreal, QC",
          is_approved: true,
          is_featured: true,
          created_at: new Date(Date.now() - 259200000).toISOString()
        }
      ];
      this.filterTestimonials();
      this.loading = false;
    }, 1000);
  }

  setActiveFilter(filter: string) {
    this.activeFilter = filter;
    this.filterTestimonials();
  }

  filterTestimonials() {
    switch (this.activeFilter) {
      case 'approved':
        this.filteredTestimonials = this.testimonials.filter(t => t.is_approved);
        break;
      case 'pending':
        this.filteredTestimonials = this.testimonials.filter(t => !t.is_approved);
        break;
      case 'featured':
        this.filteredTestimonials = this.testimonials.filter(t => t.is_featured);
        break;
      default:
        this.filteredTestimonials = [...this.testimonials];
    }
  }

  openAddModal() {
    this.isEditing = false;
    this.currentTestimonial = null;
    this.testimonialForm.reset({
      name: '',
      message: '',
      rating: 5,
      image_url: '',
      video_url: '',
      location: '',
      is_approved: true,
      is_featured: false
    });
    this.showModal = true;
  }

  editTestimonial(testimonial: Testimonial) {
    this.isEditing = true;
    this.currentTestimonial = testimonial;
    this.testimonialForm.patchValue(testimonial);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.isEditing = false;
    this.currentTestimonial = null;
  }

  saveTestimonial() {
    if (this.testimonialForm.invalid) return;

    this.isLoading = true;
    const formData = this.testimonialForm.value;

    if (this.isEditing && this.currentTestimonial) {
      // Update existing testimonial
      const updatedTestimonial = { ...this.currentTestimonial, ...formData };
      const index = this.testimonials.findIndex(t => t.id === this.currentTestimonial!.id);
      if (index !== -1) {
        this.testimonials[index] = updatedTestimonial;
      }
    } else {
      // Add new testimonial
      const newTestimonial: Testimonial = {
        id: Date.now(),
        ...formData,
        created_at: new Date().toISOString()
      };
      this.testimonials.unshift(newTestimonial);
    }

    setTimeout(() => {
      this.filterTestimonials();
      this.isLoading = false;
      this.closeModal();
    }, 1000);
  }

  toggleApproval(testimonial: Testimonial) {
    testimonial.is_approved = !testimonial.is_approved;
    this.filterTestimonials();
  }

  toggleFeatured(testimonial: Testimonial) {
    testimonial.is_featured = !testimonial.is_featured;
    this.filterTestimonials();
  }

  deleteTestimonial(testimonial: Testimonial) {
    if (confirm(`Are you sure you want to delete the testimonial from "${testimonial.name}"?`)) {
      this.testimonials = this.testimonials.filter(t => t.id !== testimonial.id);
      this.filterTestimonials();
    }
  }

  getStars(rating: number): number[] {
    return Array.from({ length: 5 }, (_, i) => i + 1);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }
}
