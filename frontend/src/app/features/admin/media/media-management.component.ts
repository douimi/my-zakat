import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

interface MediaItem {
  id?: number;
  title: string;
  description?: string;
  file_url: string;
  file_type: 'image' | 'video';
  location: 'hero' | 'gallery' | 'testimonials' | 'stories';
  is_active: boolean;
  order_index: number;
  created_at?: string;
}

@Component({
  selector: 'app-media-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Media Management</h1>
        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="fas fa-plus"></i> Add Media
        </button>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button *ngFor="let location of locations" 
                class="tab-button" 
                [class.active]="activeLocation === location.value"
                (click)="setActiveLocation(location.value)">
          <i [class]="location.icon"></i>
          {{location.label}}
        </button>
      </div>

      <!-- Media Grid -->
      <div class="media-grid">
        <div *ngFor="let media of filteredMedia" class="media-card" [class.inactive]="!media.is_active">
          <div class="media-preview">
            <img *ngIf="media.file_type === 'image'" [src]="media.file_url" [alt]="media.title">
            <video *ngIf="media.file_type === 'video'" [src]="media.file_url" controls></video>
            <div class="media-overlay">
              <div class="media-type">
                <i class="fas" [class.fa-image]="media.file_type === 'image'" [class.fa-video]="media.file_type === 'video'"></i>
                {{media.file_type | titlecase}}
              </div>
              <div class="media-actions">
                <button class="btn-icon btn-edit" (click)="editMedia(media)" title="Edit">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-toggle" 
                        (click)="toggleMediaStatus(media)" 
                        [title]="media.is_active ? 'Deactivate' : 'Activate'">
                  <i class="fas" [class.fa-eye]="media.is_active" [class.fa-eye-slash]="!media.is_active"></i>
                </button>
                <button class="btn-icon btn-delete" (click)="deleteMedia(media)" title="Delete">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
          
          <div class="media-info">
            <h4>{{media.title}}</h4>
            <p *ngIf="media.description">{{media.description}}</p>
            <div class="media-meta">
              <span class="location-badge">{{getLocationLabel(media.location)}}</span>
              <span class="status-badge" [class.active]="media.is_active" [class.inactive]="!media.is_active">
                {{media.is_active ? 'Active' : 'Inactive'}}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Add/Edit Modal -->
      <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{isEditing ? 'Edit Media' : 'Add New Media'}}</h2>
            <button class="btn-close" (click)="closeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <form [formGroup]="mediaForm" (ngSubmit)="saveMedia()">
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="title">Title *</label>
                <input type="text" id="title" formControlName="title" class="form-control">
                <div class="error-message" *ngIf="mediaForm.get('title')?.touched && mediaForm.get('title')?.errors">
                  Title is required
                </div>
              </div>

              <div class="form-group full-width">
                <label for="description">Description</label>
                <textarea id="description" formControlName="description" rows="3" class="form-control"></textarea>
              </div>

              <div class="form-group">
                <label for="file_type">Media Type *</label>
                <select id="file_type" formControlName="file_type" class="form-control">
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <div class="form-group">
                <label for="location">Location *</label>
                <select id="location" formControlName="location" class="form-control">
                  <option value="hero">Hero Section</option>
                  <option value="gallery">Gallery</option>
                  <option value="testimonials">Testimonials</option>
                  <option value="stories">Stories</option>
                </select>
              </div>

              <div class="form-group full-width">
                <label for="file_url">File URL *</label>
                <input type="url" id="file_url" formControlName="file_url" class="form-control">
                <small class="form-text">Enter the URL of your uploaded media file</small>
                <div class="error-message" *ngIf="mediaForm.get('file_url')?.touched && mediaForm.get('file_url')?.errors">
                  File URL is required
                </div>
              </div>

              <div class="form-group">
                <label for="order_index">Display Order</label>
                <input type="number" id="order_index" formControlName="order_index" class="form-control" min="0">
                <small class="form-text">Lower numbers appear first</small>
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
              <button type="submit" class="btn btn-primary" [disabled]="mediaForm.invalid || isLoading">
                <i class="fas fa-spinner fa-spin" *ngIf="isLoading"></i>
                {{isEditing ? 'Update Media' : 'Add Media'}}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Upload Instructions -->
      <div class="upload-instructions">
        <h3><i class="fas fa-info-circle"></i> Upload Instructions</h3>
        <div class="instructions-grid">
          <div class="instruction-card">
            <h4>1. Upload Your Files</h4>
            <p>Upload your images and videos to a cloud service like:</p>
            <ul>
              <li>Google Drive (make sure files are publicly accessible)</li>
              <li>Dropbox</li>
              <li>AWS S3</li>
              <li>Your web hosting provider</li>
            </ul>
          </div>
          <div class="instruction-card">
            <h4>2. Get the Direct URL</h4>
            <p>Copy the direct URL to your file. For Google Drive:</p>
            <ul>
              <li>Right-click file → Get link</li>
              <li>Change sharing to "Anyone with the link"</li>
              <li>Use format: <code>https://drive.google.com/uc?id=FILE_ID</code></li>
            </ul>
          </div>
          <div class="instruction-card">
            <h4>3. Recommended Sizes</h4>
            <ul>
              <li><strong>Hero Images:</strong> 1920x1080px</li>
              <li><strong>Gallery Images:</strong> 800x600px</li>
              <li><strong>Videos:</strong> Max 50MB, MP4 format</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading media...</p>
      </div>
    </div>
  `,
  styleUrls: ['./media-management.component.scss']
})
export class MediaManagementComponent implements OnInit {
  mediaItems: MediaItem[] = [];
  filteredMedia: MediaItem[] = [];
  showModal = false;
  isEditing = false;
  loading = true;
  isLoading = false;
  currentMedia: MediaItem | null = null;
  activeLocation = 'hero';

  locations = [
    { value: 'hero', label: 'Hero Section', icon: 'fas fa-home' },
    { value: 'gallery', label: 'Gallery', icon: 'fas fa-images' },
    { value: 'testimonials', label: 'Testimonials', icon: 'fas fa-quote-left' },
    { value: 'stories', label: 'Stories', icon: 'fas fa-book' }
  ];

  mediaForm: FormGroup;

  constructor(
    private apiService: ApiService,
    private fb: FormBuilder
  ) {
    this.mediaForm = this.fb.group({
      title: ['', [Validators.required]],
      description: [''],
      file_type: ['image', [Validators.required]],
      location: ['hero', [Validators.required]],
      file_url: ['', [Validators.required]],
      order_index: [0],
      is_active: [true]
    });
  }

  ngOnInit() {
    this.loadMedia();
  }

  loadMedia() {
    this.loading = true;
    
    // Sample data for development
    setTimeout(() => {
      this.mediaItems = [
        {
          id: 1,
          title: "Hero Video - Foundation Impact",
          description: "Main hero video showcasing our foundation's work",
          file_url: "assets/videos/hero2.mp4",
          file_type: "video",
          location: "hero",
          is_active: true,
          order_index: 1,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          title: "Community Support Image",
          description: "Image showing community support activities",
          file_url: "assets/images/hero.jpg",
          file_type: "image",
          location: "hero",
          is_active: true,
          order_index: 2,
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 3,
          title: "Success Story Video",
          description: "Video testimonial from beneficiary",
          file_url: "assets/videos/story1.mp4",
          file_type: "video",
          location: "stories",
          is_active: true,
          order_index: 1,
          created_at: new Date(Date.now() - 172800000).toISOString()
        },
        {
          id: 4,
          title: "Gallery - Food Distribution",
          description: "Photos from recent food distribution event",
          file_url: "assets/images/Difference/difference1.jpg",
          file_type: "image",
          location: "gallery",
          is_active: true,
          order_index: 1,
          created_at: new Date(Date.now() - 259200000).toISOString()
        }
      ];
      this.filterMedia();
      this.loading = false;
    }, 1000);
  }

  setActiveLocation(location: string) {
    this.activeLocation = location;
    this.filterMedia();
  }

  filterMedia() {
    this.filteredMedia = this.mediaItems
      .filter(media => media.location === this.activeLocation)
      .sort((a, b) => a.order_index - b.order_index);
  }

  openAddModal() {
    this.isEditing = false;
    this.currentMedia = null;
    this.mediaForm.reset({
      title: '',
      description: '',
      file_type: 'image',
      location: this.activeLocation,
      file_url: '',
      order_index: 0,
      is_active: true
    });
    this.showModal = true;
  }

  editMedia(media: MediaItem) {
    this.isEditing = true;
    this.currentMedia = media;
    this.mediaForm.patchValue(media);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.isEditing = false;
    this.currentMedia = null;
  }

  saveMedia() {
    if (this.mediaForm.invalid) return;

    this.isLoading = true;
    const formData = this.mediaForm.value;

    if (this.isEditing && this.currentMedia) {
      // Update existing media
      const updatedMedia = { ...this.currentMedia, ...formData };
      const index = this.mediaItems.findIndex(m => m.id === this.currentMedia!.id);
      if (index !== -1) {
        this.mediaItems[index] = updatedMedia;
      }
    } else {
      // Add new media
      const newMedia: MediaItem = {
        id: Date.now(),
        ...formData,
        created_at: new Date().toISOString()
      };
      this.mediaItems.push(newMedia);
    }

    setTimeout(() => {
      this.filterMedia();
      this.isLoading = false;
      this.closeModal();
    }, 1000);
  }

  toggleMediaStatus(media: MediaItem) {
    media.is_active = !media.is_active;
  }

  deleteMedia(media: MediaItem) {
    if (confirm(`Are you sure you want to delete "${media.title}"?`)) {
      this.mediaItems = this.mediaItems.filter(m => m.id !== media.id);
      this.filterMedia();
    }
  }

  getLocationLabel(location: string): string {
    const locationObj = this.locations.find(l => l.value === location);
    return locationObj ? locationObj.label : location;
  }
}
