import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home">
      <!-- Hero Section with Video Background -->
      <section class="hero-section">
        <div class="hero-video-container">
          <video autoplay muted loop playsinline class="hero-video">
            <source src="assets/videos/hero2.mp4" type="video/mp4">
          </video>
          <div class="hero-overlay"></div>
        </div>
        
        <div class="hero-content">
          <div class="container">
            <div class="hero-text">
              <h1 class="hero-title animate-fade-in">
                Transform Lives Through
                <span class="text-accent-yellow"> Zakat</span>
              </h1>
              <p class="hero-subtitle animate-slide-up">
                Join us in making a lasting impact. Your contribution provides meals, 
                supports families, and brings hope to those in need.
              </p>
              <div class="hero-actions animate-slide-up">
                <a routerLink="/donate" class="btn btn-primary btn-large">
                  Donate Now
                </a>
                <a routerLink="/stories" class="btn btn-secondary btn-large">
                  See Our Impact
                </a>
              </div>
            </div>
          </div>
        </div>
        
        <div class="hero-stats">
          <div class="container">
            <div class="stats-grid">
              <div class="stat-item animate-fade-in">
                <div class="stat-number" data-count="50000">{{ stats.meals }}</div>
                <div class="stat-label">Meals Provided</div>
              </div>
              <div class="stat-item animate-fade-in">
                <div class="stat-number" data-count="1200">{{ stats.families }}</div>
                <div class="stat-label">Families Supported</div>
              </div>
              <div class="stat-item animate-fade-in">
                <div class="stat-number" data-count="800">{{ stats.orphans }}</div>
                <div class="stat-label">Orphans Sponsored</div>
              </div>
              <div class="stat-item animate-fade-in">
                <div class="stat-number" data-count="15">{{ stats.countries }}</div>
                <div class="stat-label">Countries Reached</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Featured Stories Carousel -->
      <section class="section stories-section">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title">Stories of Hope</h2>
            <p class="section-subtitle">
              Real families, real impact. See how your donations change lives.
            </p>
          </div>
          
          <div class="stories-carousel">
            <div class="carousel-container">
              <div class="carousel-track">
                <div *ngFor="let story of featuredStories" class="story-card">
                  <div class="story-media">
                    <img [src]="'assets/images/stories/' + story.image_filename" 
                         [alt]="story.title" class="story-image">
                    <div class="story-overlay">
                      <a routerLink="/stories/{{story.id}}" class="story-link">
                        Read Story
                      </a>
                    </div>
                  </div>
                  <div class="story-content">
                    <h3 class="story-title">{{ story.title }}</h3>
                    <p class="story-summary">{{ story.summary }}</p>
                    <a routerLink="/stories/{{story.id}}" class="story-cta">
                      Learn More →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Impact Gallery -->
      <section class="section impact-section bg-light">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title">Our Impact in Action</h2>
            <p class="section-subtitle">
              Every donation creates ripples of change across communities
            </p>
          </div>
          
          <div class="impact-gallery">
            <div class="gallery-grid">
              <div class="gallery-item large">
                <img src="assets/images/Difference/impact1.jpeg" alt="Food Distribution">
                <div class="gallery-overlay">
                  <h3>Food Distribution</h3>
                  <p>Providing nutritious meals to families in need</p>
                </div>
              </div>
              <div class="gallery-item">
                <img src="assets/images/aboutus/impact1.jpg" alt="Education Support">
                <div class="gallery-overlay">
                  <h3>Education Support</h3>
                  <p>Empowering children through education</p>
                </div>
              </div>
              <div class="gallery-item">
                <img src="assets/images/aboutus/impact2.jpg" alt="Medical Aid">
                <div class="gallery-overlay">
                  <h3>Medical Aid</h3>
                  <p>Essential healthcare for communities</p>
                </div>
              </div>
              <div class="gallery-item tall">
                <img src="assets/images/Difference/sponsor_orphan.jpg" alt="Orphan Care">
                <div class="gallery-overlay">
                  <h3>Orphan Care</h3>
                  <p>Providing love and support to orphans</p>
                </div>
              </div>
              <div class="gallery-item">
                <img src="assets/images/Difference/sponsor_family.jpg" alt="Family Support">
                <div class="gallery-overlay">
                  <h3>Family Support</h3>
                  <p>Helping families rebuild their lives</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Video Testimonials -->
      <section class="section testimonials-section">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title">Voices of Gratitude</h2>
            <p class="section-subtitle">
              Hear from the families whose lives you've touched
            </p>
          </div>
          
          <div class="testimonials-grid">
            <div class="testimonial-card featured">
              <div class="testimonial-video">
                <video controls poster="assets/images/testimonials/testimonial1.jpg">
                  <source src="assets/videos/testimonial1.mp4" type="video/mp4">
                </video>
              </div>
              <div class="testimonial-content">
                <p class="testimonial-text">
                  "Thanks to MyZakat Foundation, my children can go to school and we have food on our table. 
                  You've given us hope for a better future."
                </p>
                <div class="testimonial-author">
                  <img src="assets/images/testimonials/testimonial1.jpg" alt="Fatima">
                  <div>
                    <h4>Fatima Ahmed</h4>
                    <p>Mother of 3, Yemen</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="testimonial-card">
              <div class="testimonial-content">
                <div class="rating">
                  <i class="star">★</i>
                  <i class="star">★</i>
                  <i class="star">★</i>
                  <i class="star">★</i>
                  <i class="star">★</i>
                </div>
                <p class="testimonial-text">
                  "The orphan sponsorship program changed my life. I now have access to education and healthcare."
                </p>
                <div class="testimonial-author">
                  <img src="assets/images/testimonials/testimonial2.jpeg" alt="Ahmad">
                  <div>
                    <h4>Ahmad Hassan</h4>
                    <p>Sponsored Child, Syria</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="testimonial-card">
              <div class="testimonial-content">
                <div class="rating">
                  <i class="star">★</i>
                  <i class="star">★</i>
                  <i class="star">★</i>
                  <i class="star">★</i>
                  <i class="star">★</i>
                </div>
                <p class="testimonial-text">
                  "Your Ramadan food packages brought joy to our community. May Allah reward your generosity."
                </p>
                <div class="testimonial-author">
                  <img src="assets/images/testimonials/testimonial3.jpg" alt="Ibrahim">
                  <div>
                    <h4>Ibrahim Malik</h4>
                    <p>Community Leader, Pakistan</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Call to Action -->
      <section class="section cta-section">
        <div class="cta-background">
          <img src="assets/images/cta_background.jpeg" alt="Help Today">
        </div>
        <div class="cta-overlay"></div>
        <div class="container">
          <div class="cta-content">
            <h2 class="cta-title">Every Moment Counts</h2>
            <p class="cta-text">
              While you read this, families are waiting for help. Your donation today 
              can provide immediate relief and lasting change.
            </p>
            <div class="cta-options">
              <div class="donation-option">
                <div class="option-amount">$25</div>
                <div class="option-impact">Feeds a family for a week</div>
              </div>
              <div class="donation-option featured">
                <div class="option-amount">$100</div>
                <div class="option-impact">Sponsors a child's education</div>
              </div>
              <div class="donation-option">
                <div class="option-amount">$500</div>
                <div class="option-impact">Supports a family for a month</div>
              </div>
            </div>
            <a routerLink="/donate" class="btn btn-primary btn-large pulse">
              Make Your Impact Now
            </a>
          </div>
        </div>
      </section>

      <!-- Upcoming Events -->
      <section class="section events-section bg-light">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title">Join Our Mission</h2>
            <p class="section-subtitle">
              Upcoming events and campaigns where you can make a difference
            </p>
          </div>
          
          <div class="events-grid">
            <div *ngFor="let event of upcomingEvents" class="event-card">
              <div class="event-date">
                <span class="date-day">{{ getEventDay(event.date) }}</span>
                <span class="date-month">{{ getEventMonth(event.date) }}</span>
              </div>
              <div class="event-image">
                <img [src]="'assets/images/Events/' + event.image" [alt]="event.title">
              </div>
              <div class="event-content">
                <h3 class="event-title">{{ event.title }}</h3>
                <p class="event-location">
                  <i class="location-icon">📍</i> {{ event.location }}
                </p>
                <p class="event-description">{{ event.description }}</p>
                <a routerLink="/events/{{event.id}}" class="event-link">
                  Learn More →
                </a>
              </div>
            </div>
          </div>
          
          <div class="text-center">
            <a routerLink="/events" class="btn btn-secondary">
              View All Events
            </a>
          </div>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  stats = {
    meals: 0,
    families: 0,
    orphans: 0,
    countries: 0
  };
  
  featuredStories: any[] = [];
  upcomingEvents: any[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadStats();
    this.loadFeaturedStories();
    this.loadUpcomingEvents();
    this.animateCounters();
  }

  loadStats() {
    this.apiService.get('/stats/impact').subscribe((data: any) => {
      this.stats = {
        meals: data.impact.meals_provided,
        families: data.impact.families_helped,
        orphans: data.impact.orphans_sponsored,
        countries: 15 // Static for now
      };
    });
  }

  loadFeaturedStories() {
    this.apiService.get('/stories/featured').subscribe((data: any) => {
      this.featuredStories = data.stories;
    });
  }

  loadUpcomingEvents() {
    this.apiService.get('/events/upcoming?limit=3').subscribe((data: any) => {
      this.upcomingEvents = data.events;
    });
  }

  animateCounters() {
    // Counter animation logic
    setTimeout(() => {
      const counters = document.querySelectorAll('.stat-number');
      counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-count') || '0');
        const increment = target / 200;
        let current = 0;
        
        const updateCounter = () => {
          current += increment;
          if (current < target) {
            (counter as HTMLElement).innerText = Math.ceil(current).toLocaleString();
            requestAnimationFrame(updateCounter);
          } else {
            (counter as HTMLElement).innerText = target.toLocaleString();
          }
        };
        
        updateCounter();
      });
    }, 500);
  }

  getEventDay(date: string): string {
    return new Date(date).getDate().toString();
  }

  getEventMonth(date: string): string {
    return new Date(date).toLocaleDateString('en', { month: 'short' }).toUpperCase();
  }
}
