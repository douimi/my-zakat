import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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
}

@Component({
  selector: 'app-events-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="events-page">
      <section class="events-hero">
        <h1>Upcoming Events</h1>
        <p>Join us in making a difference through community engagement and fundraising events</p>
      </section>

      <section class="events-list">
        <div class="container">
          <div class="events-grid">
            <div *ngFor="let event of events" 
                 class="event-card" 
                 [class.featured]="event.is_featured">
              <div class="event-image">
                <img [src]="event.image || 'assets/images/Events/event-default.jpg'" 
                     [alt]="event.title">
                <div *ngIf="event.is_featured" class="featured-badge">Featured</div>
              </div>
              
              <div class="event-content">
                <h3>{{event.title}}</h3>
                <p class="event-description">{{event.description}}</p>
                
                <div class="event-details">
                  <div class="event-detail-item">
                    <i class="fas fa-calendar"></i>
                    <span>{{formatDate(event.date)}}</span>
                  </div>
                  <div class="event-detail-item">
                    <i class="fas fa-clock"></i>
                    <span>{{event.time}}</span>
                  </div>
                  <div class="event-detail-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>{{event.location}}</span>
                  </div>
                </div>
                
                <div class="event-actions">
                  <a [routerLink]="['/events', event.id]" class="btn-primary">Learn More</a>
                  <button *ngIf="event.registration_required" 
                          class="btn-secondary"
                          (click)="registerForEvent(event)">
                    Register
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div *ngIf="events.length === 0" class="no-events">
            <i class="fas fa-calendar-times"></i>
            <h3>No Upcoming Events</h3>
            <p>Stay tuned for upcoming events and opportunities to get involved!</p>
          </div>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['./events-list.component.scss']
})
export class EventsListComponent implements OnInit {
  events: Event[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadEvents();
  }

  loadEvents() {
    this.apiService.get('/events').subscribe({
      next: (response: any) => {
        this.events = response.events || [];
      },
      error: (error) => {
        console.error('Error loading events:', error);
        // Fallback with sample data for development
        this.events = [
          {
            id: 1,
            title: 'Annual Charity Gala',
            description: 'Join us for an evening of giving and celebration as we raise funds for our humanitarian programs.',
            date: '2024-03-15',
            time: '6:00 PM - 10:00 PM',
            location: 'Grand Ballroom, City Center',
            image: 'assets/images/Events/charity-gala.jpg',
            is_featured: true,
            registration_required: true
          },
          {
            id: 2,
            title: 'Community Food Drive',
            description: 'Help us collect and distribute food to families in need in our local community.',
            date: '2024-02-28',
            time: '9:00 AM - 3:00 PM',
            location: 'Community Center, Main Street',
            image: 'assets/images/Events/food-drive.jpg',
            is_featured: false,
            registration_required: false
          },
          {
            id: 3,
            title: 'Ramadan Iftar Gathering',
            description: 'Break your fast with the community and share in the spirit of Ramadan.',
            date: '2024-04-10',
            time: '7:30 PM - 9:00 PM',
            location: 'Islamic Center, Oak Avenue',
            image: 'assets/images/Events/ramadan-iftar.jpg',
            is_featured: true,
            registration_required: true
          }
        ];
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

  registerForEvent(event: Event) {
    // Implement registration logic
    console.log('Registering for event:', event.title);
    alert(`Registration for "${event.title}" - This feature will be implemented with a registration form.`);
  }
}
