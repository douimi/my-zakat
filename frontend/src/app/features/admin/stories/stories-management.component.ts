import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

interface Story {
  id?: number;
  title: string;
  summary: string;
  content: string;
  image_filename?: string;
  video_url?: string;
  is_featured: boolean;
  is_active: boolean;
  category?: string;
  created_at?: string;
  updated_at?: string;
}

@Component({
  selector: 'app-stories-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Story Management</h1>
        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="fas fa-plus"></i> Add New Story
        </button>
      </div>

      <!-- Stories List -->
      <div class="content-card">
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Featured</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let story of stories" [class.inactive]="!story.is_active">
                <td>
                  <div class="story-info">
                    <img *ngIf="story.image_filename" [src]="'assets/images/stories/' + story.image_filename" alt="" class="story-thumb">
                    <div>
                      <h4>{{story.title}}</h4>
                      <p>{{story.summary || (story.content | slice:0:100)}}{{(story.summary || story.content).length > 100 ? '...' : ''}}</p>
                      <small *ngIf="story.category" class="category-tag">{{story.category}}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="status-badge" [class.active]="story.is_active" [class.inactive]="!story.is_active">
                    {{story.is_active ? 'Active' : 'Inactive'}}
                  </span>
                </td>
                <td>
                  <span class="featured-badge" *ngIf="story.is_featured">
                    <i class="fas fa-star"></i> Featured
                  </span>
                </td>
                <td>{{formatDate(story.created_at)}}</td>
                <td>
                  <div class="action-buttons">
                    <button class="btn-icon btn-edit" (click)="editStory(story)" title="Edit">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-toggle" 
                            (click)="toggleStoryStatus(story)" 
                            [title]="story.is_active ? 'Deactivate' : 'Activate'">
                      <i class="fas" [class.fa-eye]="story.is_active" [class.fa-eye-slash]="!story.is_active"></i>
                    </button>
                    <button class="btn-icon btn-delete" (click)="deleteStory(story)" title="Delete">
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
            <h2>{{isEditing ? 'Edit Story' : 'Add New Story'}}</h2>
            <button class="btn-close" (click)="closeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <form [formGroup]="storyForm" (ngSubmit)="saveStory()">
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="title">Title *</label>
                <input type="text" id="title" formControlName="title" class="form-control">
                <div class="error-message" *ngIf="storyForm.get('title')?.touched && storyForm.get('title')?.errors">
                  Title is required
                </div>
              </div>

              <div class="form-group full-width">
                <label for="summary">Summary *</label>
                <textarea id="summary" formControlName="summary" rows="2" class="form-control" placeholder="Brief summary of the story"></textarea>
                <div class="error-message" *ngIf="storyForm.get('summary')?.touched && storyForm.get('summary')?.errors">
                  Summary is required
                </div>
              </div>

              <div class="form-group full-width">
                <label for="content">Content *</label>
                <textarea id="content" formControlName="content" rows="6" class="form-control"></textarea>
                <div class="error-message" *ngIf="storyForm.get('content')?.touched && storyForm.get('content')?.errors">
                  Content is required
                </div>
              </div>

              <div class="form-group">
                <label for="category">Category</label>
                <select id="category" formControlName="category" class="form-control">
                  <option value="">Select Category</option>
                  <option value="Education">Education</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Emergency">Emergency Relief</option>
                  <option value="Food">Food Aid</option>
                  <option value="Women">Women Empowerment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div class="form-group">
                <label for="image_filename">Image Filename</label>
                <input type="text" id="image_filename" formControlName="image_filename" class="form-control" placeholder="e.g., story1.jpg">
                <small class="form-text">Upload image to assets/images/stories/ folder first</small>
              </div>

              <div class="form-group">
                <label for="video_url">Video URL</label>
                <input type="url" id="video_url" formControlName="video_url" class="form-control">
                <small class="form-text">Enter the URL of the story video</small>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" formControlName="is_featured">
                  <span class="checkmark"></span>
                  Featured Story
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
              <button type="submit" class="btn btn-primary" [disabled]="storyForm.invalid || isLoading">
                <i class="fas fa-spinner fa-spin" *ngIf="isLoading"></i>
                {{isEditing ? 'Update Story' : 'Add Story'}}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading stories...</p>
      </div>
    </div>
  `,
  styleUrls: ['./stories-management.component.scss']
})
export class StoriesManagementComponent implements OnInit {
  stories: Story[] = [];
  showModal = false;
  isEditing = false;
  loading = true;
  isLoading = false;
  currentStory: Story | null = null;

  storyForm: FormGroup;

  constructor(
    private apiService: ApiService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.storyForm = this.fb.group({
      title: ['', [Validators.required]],
      summary: ['', [Validators.required]],
      content: ['', [Validators.required]],
      image_filename: [''],
      video_url: [''],
      category: [''],
      is_featured: [false],
      is_active: [true]
    });
  }

  ngOnInit() {
    this.loadStories();
  }

  loadStories() {
    this.loading = true;
    
    this.apiService.get('/admin/stories').subscribe({
      next: (response: any) => {
        this.stories = response.stories || response;
        console.log('Stories loaded:', this.stories);
      },
      error: (error) => {
        console.error('Error loading stories:', error);
        // Show user-friendly error message
        alert('Failed to load stories. Please check your connection and try again.');
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  openAddModal() {
    this.isEditing = false;
    this.currentStory = null;
    this.storyForm.reset({
      title: '',
      summary: '',
      content: '',
      image_filename: '',
      video_url: '',
      category: '',
      is_featured: false,
      is_active: true
    });
    this.showModal = true;
  }

  editStory(story: Story) {
    this.isEditing = true;
    this.currentStory = story;
    this.storyForm.patchValue(story);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.isEditing = false;
    this.currentStory = null;
  }

  saveStory() {
    if (this.storyForm.invalid) return;

    this.isLoading = true;
    const formData = this.storyForm.value;

    const endpoint = this.isEditing ? `/admin/stories/${this.currentStory!.id}` : '/admin/stories';
    const method = this.isEditing ? 'put' : 'post';

    this.apiService[method](endpoint, formData).subscribe({
      next: (response) => {
        console.log('Story saved successfully:', response);
        this.loadStories(); // Reload the list
        this.closeModal();
      },
      error: (error) => {
        console.error('Error saving story:', error);
        alert('Failed to save story. Please try again.');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  toggleStoryStatus(story: Story) {
    const originalStatus = story.is_active;
    story.is_active = !story.is_active;
    
    this.apiService.put(`/admin/stories/${story.id}`, { is_active: story.is_active }).subscribe({
      next: (response) => {
        console.log('Story status updated');
      },
      error: (error) => {
        console.error('Error updating story status:', error);
        story.is_active = originalStatus; // Revert on error
        alert('Failed to update story status. Please try again.');
      }
    });
  }

  deleteStory(story: Story) {
    if (confirm(`Are you sure you want to delete "${story.title}"?`)) {
      this.apiService.delete(`/admin/stories/${story.id}`).subscribe({
        next: (response) => {
          console.log('Story deleted successfully');
          this.loadStories(); // Reload the list
        },
        error: (error) => {
          console.error('Error deleting story:', error);
          alert('Failed to delete story. Please try again.');
        }
      });
    }
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
