import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

interface Event {
  id?: number;
  title: string;
  description: string;
  event_date: string;
  location: string;
  image_url?: string;
  registration_link?: string;
  is_featured: boolean;
  is_active: boolean;
  created_at?: string;
}

@Component({
  selector: 'app-events-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Event Management</h1>
        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="fas fa-plus"></i> Add New Event
        </button>
      </div>

      <!-- Events List -->
      <div class="content-card">
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date & Location</th>
                <th>Status</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let event of events" [class.inactive]="!event.is_active">
                <td>
                  <div class="event-info">
                    <img *ngIf="event.image_url" [src]="event.image_url" alt="" class="event-thumb">
                    <div>
                      <h4>{{event.title}}</h4>
                      <p>{{event.description | slice:0:100}}{{event.description.length > 100 ? '...' : ''}}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="date-location">
                    <div class="date">
                      <i class="fas fa-calendar"></i>
                      {{formatDate(event.event_date)}}
                    </div>
                    <div class="location">
                      <i class="fas fa-map-marker-alt"></i>
                      {{event.location}}
                    </div>
                  </div>
                </td>
                <td>
                  <span class="status-badge" [class.active]="event.is_active" [class.inactive]="!event.is_active">
                    {{event.is_active ? 'Active' : 'Inactive'}}
                  </span>
                </td>
                <td>
                  <span class="featured-badge" *ngIf="event.is_featured">
                    <i class="fas fa-star"></i> Featured
                  </span>
                </td>
                <td>
                  <div class="action-buttons">
                    <button class="btn-icon btn-edit" (click)="editEvent(event)" title="Edit">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-toggle" 
                            (click)="toggleEventStatus(event)" 
                            [title]="event.is_active ? 'Deactivate' : 'Activate'">
                      <i class="fas" [class.fa-eye]="event.is_active" [class.fa-eye-slash]="!event.is_active"></i>
                    </button>
                    <button class="btn-icon btn-delete" (click)="deleteEvent(event)" title="Delete">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add/Edit Modal -->
      <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{isEditing ? 'Edit Event' : 'Add New Event'}}</h2>
            <button class="btn-close" (click)="closeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <form [formGroup]="eventForm" (ngSubmit)="saveEvent()">
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="title">Event Title *</label>
                <input type="text" id="title" formControlName="title" class="form-control">
                <div class="error-message" *ngIf="eventForm.get('title')?.touched && eventForm.get('title')?.errors">
                  Title is required
                </div>
              </div>

              <div class="form-group full-width">
                <label for="description">Description *</label>
                <textarea id="description" formControlName="description" rows="4" class="form-control"></textarea>
                <div class="error-message" *ngIf="eventForm.get('description')?.touched && eventForm.get('description')?.errors">
                  Description is required
                </div>
              </div>

              <div class="form-group">
                <label for="event_date">Event Date *</label>
                <input type="datetime-local" id="event_date" formControlName="event_date" class="form-control">
                <div class="error-message" *ngIf="eventForm.get('event_date')?.touched && eventForm.get('event_date')?.errors">
                  Event date is required
                </div>
              </div>

              <div class="form-group">
                <label for="location">Location *</label>
                <input type="text" id="location" formControlName="location" class="form-control">
                <div class="error-message" *ngIf="eventForm.get('location')?.touched && eventForm.get('location')?.errors">
                  Location is required
                </div>
              </div>

              <div class="form-group">
                <label for="image_url">Image URL</label>
                <input type="url" id="image_url" formControlName="image_url" class="form-control">
                <small class="form-text">Enter the URL of the event image</small>
              </div>

              <div class="form-group">
                <label for="registration_link">Registration Link</label>
                <input type="url" id="registration_link" formControlName="registration_link" class="form-control">
                <small class="form-text">Link for event registration</small>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" formControlName="is_featured">
                  <span class="checkmark"></span>
                  Featured Event
                </label>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" formControlName="is_active">
                  <span class="checkmark"></span>
                  Active
                </label>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="eventForm.invalid || isLoading">
                <i class="fas fa-spinner fa-spin" *ngIf="isLoading"></i>
                {{isEditing ? 'Update Event' : 'Add Event'}}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading events...</p>
      </div>
    </div>
  `,
  styleUrls: ['../stories/stories-management.component.scss']
})
export class EventsManagementComponent implements OnInit {
  events: Event[] = [];
  showModal = false;
  isEditing = false;
  loading = true;
  isLoading = false;
  currentEvent: Event | null = null;

  eventForm: FormGroup;

  constructor(
    private apiService: ApiService,
    private fb: FormBuilder
  ) {
    this.eventForm = this.fb.group({
      title: ['', [Validators.required]],
      description: ['', [Validators.required]],
      event_date: ['', [Validators.required]],
      location: ['', [Validators.required]],
      image_url: [''],
      registration_link: [''],
      is_featured: [false],
      is_active: [true]
    });
  }

  ngOnInit() {
    this.loadEvents();
  }

  loadEvents() {
    this.loading = true;
    
    // Sample data for development
    setTimeout(() => {
      this.events = [
        {
          id: 1,
          title: "Annual Charity Gala",
          description: "Join us for our annual charity gala featuring dinner, entertainment, and fundraising for our community programs.",
          event_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          location: "Grand Ballroom, Downtown Hotel",
          image_url: "assets/images/Events/event1.jpg",
          registration_link: "https://example.com/register-gala",
          is_featured: true,
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          title: "Community Food Drive",
          description: "Help us collect and distribute food to families in need. Volunteers welcome!",
          event_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          location: "Community Center, Main Street",
          image_url: "assets/images/Events/event2.jpg",
          is_featured: false,
          is_active: true,
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 3,
          title: "Ramadan Iftar Gathering",
          description: "Breaking fast together as a community during the holy month of Ramadan.",
          event_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
          location: "Islamic Center",
          image_url: "assets/images/Events/event3.jpg",
          is_featured: true,
          is_active: true,
          created_at: new Date(Date.now() - 172800000).toISOString()
        }
      ];
      this.loading = false;
    }, 1000);
  }

  openAddModal() {
    this.isEditing = false;
    this.currentEvent = null;
    this.eventForm.reset({
      title: '',
      description: '',
      event_date: '',
      location: '',
      image_url: '',
      registration_link: '',
      is_featured: false,
      is_active: true
    });
    this.showModal = true;
  }

  editEvent(event: Event) {
    this.isEditing = true;
    this.currentEvent = event;
    
    // Format date for datetime-local input
    const formattedDate = new Date(event.event_date).toISOString().slice(0, 16);
    
    this.eventForm.patchValue({
      ...event,
      event_date: formattedDate
    });
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.isEditing = false;
    this.currentEvent = null;
  }

  saveEvent() {
    if (this.eventForm.invalid) return;

    this.isLoading = true;
    const formData = this.eventForm.value;

    if (this.isEditing && this.currentEvent) {
      // Update existing event
      const updatedEvent = { ...this.currentEvent, ...formData };
      const index = this.events.findIndex(e => e.id === this.currentEvent!.id);
      if (index !== -1) {
        this.events[index] = updatedEvent;
      }
    } else {
      // Add new event
      const newEvent: Event = {
        id: Date.now(),
        ...formData,
        created_at: new Date().toISOString()
      };
      this.events.unshift(newEvent);
    }

    setTimeout(() => {
      this.isLoading = false;
      this.closeModal();
    }, 1000);
  }

  toggleEventStatus(event: Event) {
    event.is_active = !event.is_active;
  }

  deleteEvent(event: Event) {
    if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
      this.events = this.events.filter(e => e.id !== event.id);
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
