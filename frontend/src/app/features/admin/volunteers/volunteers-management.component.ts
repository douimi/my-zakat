import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

interface Volunteer {
  id?: number;
  full_name: string;
  email: string;
  phone?: string;
  skills: string;
  availability: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

@Component({
  selector: 'app-volunteers-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Volunteer Management</h1>
        <div class="stats-summary">
          <div class="stat-item">
            <span class="stat-number">{{getCountByStatus('pending')}}</span>
            <span class="stat-label">Pending</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{getCountByStatus('approved')}}</span>
            <span class="stat-label">Approved</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{volunteers.length}}</span>
            <span class="stat-label">Total</span>
          </div>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button class="tab-button" 
                [class.active]="activeFilter === 'all'"
                (click)="setActiveFilter('all')">
          All Applications
        </button>
        <button class="tab-button" 
                [class.active]="activeFilter === 'pending'"
                (click)="setActiveFilter('pending')">
          Pending ({{getCountByStatus('pending')}})
        </button>
        <button class="tab-button" 
                [class.active]="activeFilter === 'approved'"
                (click)="setActiveFilter('approved')">
          Approved ({{getCountByStatus('approved')}})
        </button>
        <button class="tab-button" 
                [class.active]="activeFilter === 'rejected'"
                (click)="setActiveFilter('rejected')">
          Rejected ({{getCountByStatus('rejected')}})
        </button>
      </div>

      <!-- Volunteers List -->
      <div class="content-card">
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Volunteer Details</th>
                <th>Skills & Availability</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let volunteer of filteredVolunteers" [class]="'status-' + volunteer.status">
                <td>
                  <div class="volunteer-info">
                    <h4>{{volunteer.full_name}}</h4>
                    <p><i class="fas fa-envelope"></i> {{volunteer.email}}</p>
                    <p *ngIf="volunteer.phone"><i class="fas fa-phone"></i> {{volunteer.phone}}</p>
                    <p *ngIf="volunteer.message" class="message">{{volunteer.message | slice:0:100}}{{volunteer.message.length > 100 ? '...' : ''}}</p>
                  </div>
                </td>
                <td>
                  <div class="skills-availability">
                    <div class="skills">
                      <strong>Skills:</strong>
                      <span class="skill-tags">
                        <span *ngFor="let skill of getSkillArray(volunteer.skills)" class="skill-tag">{{skill}}</span>
                      </span>
                    </div>
                    <div class="availability">
                      <strong>Availability:</strong> {{volunteer.availability}}
                    </div>
                  </div>
                </td>
                <td>
                  <span class="status-badge" [class]="'status-' + volunteer.status">
                    {{volunteer.status | titlecase}}
                  </span>
                </td>
                <td>{{formatDate(volunteer.created_at)}}</td>
                <td>
                  <div class="action-buttons">
                    <button *ngIf="volunteer.status === 'pending'" 
                            class="btn-icon btn-approve" 
                            (click)="updateVolunteerStatus(volunteer, 'approved')" 
                            title="Approve">
                      <i class="fas fa-check"></i>
                    </button>
                    <button *ngIf="volunteer.status === 'pending'" 
                            class="btn-icon btn-reject" 
                            (click)="updateVolunteerStatus(volunteer, 'rejected')" 
                            title="Reject">
                      <i class="fas fa-times"></i>
                    </button>
                    <button *ngIf="volunteer.status !== 'pending'" 
                            class="btn-icon btn-reset" 
                            (click)="updateVolunteerStatus(volunteer, 'pending')" 
                            title="Reset to Pending">
                      <i class="fas fa-undo"></i>
                    </button>
                    <button class="btn-icon btn-delete" (click)="deleteVolunteer(volunteer)" title="Delete">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading volunteers...</p>
      </div>
    </div>
  `,
  styleUrls: ['../stories/stories-management.component.scss', './volunteers-management.component.scss']
})
export class VolunteersManagementComponent implements OnInit {
  volunteers: Volunteer[] = [];
  filteredVolunteers: Volunteer[] = [];
  loading = true;
  activeFilter = 'all';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadVolunteers();
  }

  loadVolunteers() {
    this.loading = true;
    
    // Sample data for development
    setTimeout(() => {
      this.volunteers = [
        {
          id: 1,
          full_name: "Ahmed Hassan",
          email: "ahmed.hassan@email.com",
          phone: "+1 (555) 123-4567",
          skills: "Event Planning, Community Outreach, Fundraising",
          availability: "Weekends",
          message: "I'm passionate about helping the community and have experience organizing charity events.",
          status: 'pending',
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          full_name: "Sarah Khan",
          email: "sarah.khan@email.com",
          phone: "+1 (555) 234-5678",
          skills: "Social Media, Marketing, Photography",
          availability: "Evenings and weekends",
          message: "I'd love to help with your social media presence and document your events through photography.",
          status: 'approved',
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 3,
          full_name: "Omar Ali",
          email: "omar.ali@email.com",
          skills: "Teaching, Mentoring, Translation",
          availability: "Flexible",
          message: "I can help with educational programs and provide translation services for Arabic-speaking community members.",
          status: 'approved',
          created_at: new Date(Date.now() - 172800000).toISOString()
        },
        {
          id: 4,
          full_name: "Fatima Mohamed",
          email: "fatima.mohamed@email.com",
          phone: "+1 (555) 345-6789",
          skills: "Cooking, Food Preparation, Organization",
          availability: "Weekends only",
          status: 'rejected',
          created_at: new Date(Date.now() - 259200000).toISOString()
        }
      ];
      this.filterVolunteers();
      this.loading = false;
    }, 1000);
  }

  setActiveFilter(filter: string) {
    this.activeFilter = filter;
    this.filterVolunteers();
  }

  filterVolunteers() {
    if (this.activeFilter === 'all') {
      this.filteredVolunteers = [...this.volunteers];
    } else {
      this.filteredVolunteers = this.volunteers.filter(v => v.status === this.activeFilter);
    }
  }

  getCountByStatus(status: string): number {
    return this.volunteers.filter(v => v.status === status).length;
  }

  getSkillArray(skills: string): string[] {
    return skills.split(',').map(skill => skill.trim());
  }

  updateVolunteerStatus(volunteer: Volunteer, status: 'pending' | 'approved' | 'rejected') {
    volunteer.status = status;
    this.filterVolunteers();
    
    // Uncomment when backend is ready:
    /*
    this.apiService.put(`/admin/volunteers/${volunteer.id}`, { status }).subscribe({
      next: (response) => {
        console.log('Volunteer status updated');
      },
      error: (error) => {
        console.error('Error updating volunteer status:', error);
      }
    });
    */
  }

  deleteVolunteer(volunteer: Volunteer) {
    if (confirm(`Are you sure you want to delete the application from "${volunteer.full_name}"?`)) {
      this.volunteers = this.volunteers.filter(v => v.id !== volunteer.id);
      this.filterVolunteers();
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
