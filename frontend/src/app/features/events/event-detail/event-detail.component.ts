import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

interface Event {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  image?: string;
  is_featured: boolean;
  registration_required: boolean;
  full_description?: string;
  organizer?: string;
  contact_email?: string;
  max_participants?: number;
}

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="event-detail" *ngIf="event">
      <div class="event-hero">
        <div class="event-hero-image">
          <img [src]="event.image || 'assets/images/Events/event-default.jpg'" 
               [alt]="event.title">
          <div class="event-hero-overlay"></div>
        </div>
        <div class="event-hero-content">
          <div class="container">
            <h1>{{event.title}}</h1>
            <p class="event-summary">{{event.description}}</p>
          </div>
        </div>
      </div>

      <div class="event-content">
        <div class="container">
          <div class="event-layout">
            <div class="event-main">
              <div class="event-description">
                <h2>About This Event</h2>
                <p>{{event.full_description || event.description}}</p>
              </div>

              <div class="event-organizer" *ngIf="event.organizer">
                <h3>Organized by</h3>
                <p>{{event.organizer}}</p>
                <p *ngIf="event.contact_email">
                  <strong>Contact:</strong> 
                  <a [href]="'mailto:' + event.contact_email">{{event.contact_email}}</a>
                </p>
              </div>
            </div>

            <div class="event-sidebar">
              <div class="event-info-card">
                <h3>Event Details</h3>
                
                <div class="event-info-item">
                  <i class="fas fa-calendar"></i>
                  <div>
                    <strong>Date</strong>
                    <span>{{formatDate(event.date)}}</span>
                  </div>
                </div>

                <div class="event-info-item">
                  <i class="fas fa-clock"></i>
                  <div>
                    <strong>Time</strong>
                    <span>{{event.time}}</span>
                  </div>
                </div>

                <div class="event-info-item">
                  <i class="fas fa-map-marker-alt"></i>
                  <div>
                    <strong>Location</strong>
                    <span>{{event.location}}</span>
                  </div>
                </div>

                <div class="event-info-item" *ngIf="event.max_participants">
                  <i class="fas fa-users"></i>
                  <div>
                    <strong>Max Participants</strong>
                    <span>{{event.max_participants}}</span>
                  </div>
                </div>

                <div class="event-actions">
                  <button *ngIf="event.registration_required" 
                          class="btn-primary full-width"
                          (click)="registerForEvent()">
                    <i class="fas fa-user-plus"></i>
                    Register Now
                  </button>
                  
                  <button class="btn-secondary full-width"
                          (click)="shareEvent()">
                    <i class="fas fa-share"></i>
                    Share Event
                  </button>
                  
                  <a routerLink="/events" class="btn-outline full-width">
                    <i class="fas fa-arrow-left"></i>
                    Back to Events
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="!event && !loading" class="event-not-found">
      <div class="container">
        <h1>Event Not Found</h1>
        <p>The event you're looking for doesn't exist or has been removed.</p>
        <a routerLink="/events" class="btn-primary">Back to Events</a>
      </div>
    </div>

    <div *ngIf="loading" class="loading">
      <div class="container">
        <div class="loading-spinner"></div>
        <p>Loading event details...</p>
      </div>
    </div>
  `,
  styleUrls: ['./event-detail.component.scss']
})
export class EventDetailComponent implements OnInit {
  event: Event | null = null;
  loading = true;
  eventId: number = 0;

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.eventId = +params['id'];
      this.loadEventDetail();
    });
  }

  loadEventDetail() {
    this.loading = true;
    
    this.apiService.get(`/events/${this.eventId}`).subscribe({
      next: (response: any) => {
        this.event = response.event;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading event detail:', error);
        // Fallback with sample data for development
        this.event = {
          id: this.eventId,
          title: 'Annual Charity Gala',
          description: 'Join us for an evening of giving and celebration as we raise funds for our humanitarian programs.',
          full_description: 'Our Annual Charity Gala is a premier fundraising event that brings together donors, volunteers, and community leaders to support our mission of alleviating poverty and providing aid to those in need. The evening will feature dinner, entertainment, silent auctions, and inspiring stories from the communities we serve. All proceeds go directly to our humanitarian programs worldwide.',
          date: '2024-03-15',
          time: '6:00 PM - 10:00 PM',
          location: 'Grand Ballroom, City Center',
          image: 'assets/images/Events/charity-gala.jpg',
          is_featured: true,
          registration_required: true,
          organizer: 'Zakat Distribution Foundation',
          contact_email: 'events@zdf.org',
          max_participants: 200
        };
        this.loading = false;
      }
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  registerForEvent() {
    // Implement registration logic
    console.log('Registering for event:', this.event?.title);
    alert(`Registration for "${this.event?.title}" - This feature will be implemented with a registration form.`);
  }

  shareEvent() {
    if (navigator.share && this.event) {
      navigator.share({
        title: this.event.title,
        text: this.event.description,
        url: window.location.href
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Event link copied to clipboard!');
    }
  }
}
