import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Testimonial {
  id: number;
  name: string;
  text: string;
  image?: string;
  country?: string;
  rating?: number;
  video_url?: string;
  category?: string;
  is_approved: boolean;
}

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="testimonials fade-in">
      <h2>🌟 What People Say About Us</h2>
      <p class="section-subtitle">Stories from those whose lives we've touched</p>
      
      <div class="testimonials-actions">
        <a routerLink="/submit-testimonial" class="button">Share Your Story</a>
      </div>
      
      <div class="testimonials-container">
        <div *ngFor="let testimonial of testimonials" class="testimonial fade-in">
          <div *ngIf="testimonial.image" class="testimonial-image">
            <img [src]="testimonial.image" [alt]="testimonial.name">
          </div>
          
          <div class="testimonial-content">
            <p class="testimonial-text">
              <i class="fas fa-quote-left"></i> 
              {{testimonial.text}} 
              <i class="fas fa-quote-right"></i>
            </p>
            
            <h4 class="testimonial-author">
              — {{testimonial.name}}<span *ngIf="testimonial.country">, {{testimonial.country}}</span>
            </h4>
            
            <div *ngIf="testimonial.rating" class="testimonial-rating">
              <i *ngFor="let star of getStarArray(testimonial.rating)" 
                 class="fas fa-star" 
                 style="color:#ffc107;"></i>
            </div>
            
            <div *ngIf="testimonial.video_url" class="testimonial-video">
              <video controls width="220">
                <source [src]="testimonial.video_url" type="video/mp4">
                Your browser does not support the video tag.
              </video>
            </div>
            
            <div *ngIf="testimonial.category" class="testimonial-category">
              ({{testimonial.category | titlecase}})
            </div>
          </div>
        </div>
      </div>
      
      <div *ngIf="testimonials.length === 0" class="no-testimonials">
        <p>No testimonials available at the moment. Be the first to share your story!</p>
        <a routerLink="/submit-testimonial" class="button">Share Your Story</a>
      </div>
    </section>
  `,
  styleUrls: ['./testimonials.component.scss']
})
export class TestimonialsComponent implements OnInit {
  testimonials: Testimonial[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadTestimonials();
  }

  loadTestimonials() {
    this.apiService.get('/testimonials').subscribe({
      next: (response: any) => {
        this.testimonials = response.testimonials?.filter((t: Testimonial) => t.is_approved) || [];
      },
      error: (error) => {
        console.error('Error loading testimonials:', error);
        // Fallback with sample data for development
        this.testimonials = [
          {
            id: 1,
            name: 'Amina Hassan',
            text: 'The Zakat Distribution Foundation helped my family during our most difficult time. Their support gave us hope and the strength to rebuild our lives.',
            image: 'assets/images/testimonials/testimonial1.jpg',
            country: 'Somalia',
            rating: 5,
            category: 'family support',
            is_approved: true
          },
          {
            id: 2,
            name: 'Omar Abdullah',
            text: 'Thanks to ZDF, my children now have access to clean water and education. This organization truly changes lives.',
            image: 'assets/images/testimonials/testimonial2.jpg',
            country: 'Yemen',
            rating: 5,
            category: 'education',
            is_approved: true
          },
          {
            id: 3,
            name: 'Fatima Al-Zahra',
            text: 'The monthly food packages from ZDF have been a blessing for our community. We are forever grateful.',
            image: 'assets/images/testimonials/testimonial3.jpg',
            country: 'Syria',
            rating: 5,
            video_url: 'assets/videos/testimonial1.mp4',
            category: 'food assistance',
            is_approved: true
          },
          {
            id: 4,
            name: 'Ahmed Mohammed',
            text: 'ZDF supported my small business with a micro-loan. Now I can provide for my family and employ others in my community.',
            image: 'assets/images/testimonials/testimonial4.jpg',
            country: 'Bangladesh',
            rating: 5,
            category: 'economic empowerment',
            is_approved: true
          }
        ];
      }
    });
  }

  getStarArray(rating: number): number[] {
    return Array(rating).fill(0);
  }
}
