import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

interface Story {
  id: number;
  title: string;
  summary: string;
  image_filename: string;
  video_url?: string;
  is_featured: boolean;
}

@Component({
  selector: 'app-stories-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="real-stories">
      <h2>Real Impact Stories</h2>
      <div class="story-card-container">
        <div *ngFor="let story of stories" class="story-card fade-in">
          <img [src]="'assets/images/stories/' + story.image_filename" [alt]="story.title">
          <div *ngIf="story.video_url" 
               class="story-video-thumb" 
               tabindex="0" 
               role="button" 
               [attr.aria-label]="'Play story video for ' + story.title"
               (click)="openVideoModal(story.video_url)"
               (keydown)="onVideoKeydown($event, story.video_url)">
            <span class="play-icon"><i class="fas fa-play-circle"></i></span>
          </div>
          <h3>{{story.title}}</h3>
          <p>{{story.summary}}</p>
          <a [routerLink]="['/stories', story.id]" class="read-more">Read More</a>
        </div>
      </div>

      <div class="back-to-home">
        <a routerLink="/" fragment="featured" class="back-button">
          ⬅️ Back to Home
        </a>
      </div>

      <!-- Story Video Modal -->
      <div id="testimonialVideoModal" 
           class="video-modal" 
           [style.display]="showVideoModal ? 'flex' : 'none'"
           tabindex="-1" 
           aria-modal="true" 
           role="dialog"
           (click)="closeVideoModal($event)">
        <div class="video-modal-content">
          <span class="video-modal-close" 
                tabindex="0" 
                aria-label="Close video"
                (click)="closeVideoModal()"
                (keydown)="onCloseKeydown($event)">&times;</span>
          <video #videoPlayer 
                 controls 
                 style="max-width:100%;max-height:70vh;outline:none;">
            <source [src]="currentVideoUrl" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./stories-list.component.scss']
})
export class StoriesListComponent implements OnInit {
  stories: Story[] = [];
  showVideoModal = false;
  currentVideoUrl = '';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadStories();
  }

  loadStories() {
    this.apiService.get('/stories').subscribe({
      next: (response: any) => {
        this.stories = response.stories || [];
      },
      error: (error) => {
        console.error('Error loading stories:', error);
        // Fallback with sample data for development
        this.stories = [
          {
            id: 1,
            title: 'Helping Families in Need',
            summary: 'Through your generous donations, we were able to provide essential supplies to 50 families in rural communities.',
            image_filename: 'story1.jpg',
            video_url: 'assets/videos/story1.mp4',
            is_featured: true
          },
          {
            id: 2,
            title: 'Clean Water Initiative',
            summary: 'Your support helped us build wells and provide clean drinking water to over 1,000 people in remote villages.',
            image_filename: 'story2.jpg',
            is_featured: false
          },
          {
            id: 3,
            title: 'Education for All',
            summary: 'Thanks to your contributions, 200 children now have access to quality education and school supplies.',
            image_filename: 'story3.jpg',
            is_featured: true
          }
        ];
      }
    });
  }

  openVideoModal(videoUrl: string) {
    this.currentVideoUrl = videoUrl;
    this.showVideoModal = true;
  }

  closeVideoModal(event?: Event) {
    if (!event || event.target === event.currentTarget) {
      this.showVideoModal = false;
      this.currentVideoUrl = '';
    }
  }

  onVideoKeydown(event: KeyboardEvent, videoUrl: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openVideoModal(videoUrl);
    }
  }

  onCloseKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.closeVideoModal();
    }
  }
}
