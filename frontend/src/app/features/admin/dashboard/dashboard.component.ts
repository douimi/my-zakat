import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

interface DashboardStats {
  total_donations: number;
  total_volunteers: number;
  total_contacts: number;
  total_stories: number;
  total_events: number;
  recent_donations?: any[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-container">
      <!-- Dashboard Header -->
      <div class="dashboard-header">
        <div class="header-content">
          <h1>Admin Dashboard</h1>
          <p>Welcome back! Here's what's happening with your foundation.</p>
        </div>
        <div class="header-actions">
          <button class="logout-btn" (click)="logout()">
            <i class="fas fa-sign-out-alt"></i>
            Logout
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card donations">
          <div class="stat-icon">
            <i class="fas fa-donate"></i>
          </div>
          <div class="stat-content">
            <h3>Total Donations</h3>
            <p class="stat-number">\${{(stats?.total_donations || 0) | number:'1.2-2'}}</p>
          </div>
        </div>

        <div class="stat-card volunteers">
          <div class="stat-icon">
            <i class="fas fa-users"></i>
          </div>
          <div class="stat-content">
            <h3>Volunteers</h3>
            <p class="stat-number">{{stats?.total_volunteers || 0}}</p>
          </div>
        </div>

        <div class="stat-card contacts">
          <div class="stat-icon">
            <i class="fas fa-envelope"></i>
          </div>
          <div class="stat-content">
            <h3>Contact Submissions</h3>
            <p class="stat-number">{{stats?.total_contacts || 0}}</p>
          </div>
        </div>

        <div class="stat-card stories">
          <div class="stat-icon">
            <i class="fas fa-book"></i>
          </div>
          <div class="stat-content">
            <h3>Success Stories</h3>
            <p class="stat-number">{{stats?.total_stories || 0}}</p>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <a href="/admin/stories" class="action-card">
            <i class="fas fa-plus-circle"></i>
            <h4>Add Story</h4>
            <p>Share a new success story</p>
          </a>

          <a href="/admin/events" class="action-card">
            <i class="fas fa-calendar-plus"></i>
            <h4>Create Event</h4>
            <p>Schedule a new event</p>
          </a>

          <a href="/admin/contacts" class="action-card">
            <i class="fas fa-inbox"></i>
            <h4>View Messages</h4>
            <p>Check contact submissions</p>
          </a>

          <a href="/admin/donations" class="action-card">
            <i class="fas fa-chart-line"></i>
            <h4>Donation Reports</h4>
            <p>View donation analytics</p>
          </a>

          <a href="/admin/volunteers" class="action-card">
            <i class="fas fa-user-friends"></i>
            <h4>Manage Volunteers</h4>
            <p>Review volunteer applications</p>
          </a>

          <a href="/admin/testimonials" class="action-card">
            <i class="fas fa-star"></i>
            <h4>Testimonials</h4>
            <p>Approve testimonials</p>
          </a>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="recent-activity">
        <h2>Recent Donations</h2>
        <div class="activity-list">
          <ng-container *ngIf="hasRecentDonations(); else noActivity">
            <div *ngFor="let donation of stats?.recent_donations" class="activity-item">
              <div class="activity-icon">
                <i class="fas fa-heart"></i>
              </div>
              <div class="activity-content">
                <p><strong>{{donation.name}}</strong> donated <strong>\${{donation.amount}}</strong></p>
                <span class="activity-date">{{formatDate(donation.donated_at)}}</span>
              </div>
            </div>
          </ng-container>
          
          <ng-template #noActivity>
            <div class="no-activity">
              <p>No recent donations to display</p>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>Loading dashboard data...</p>
      </div>
    </div>
  `,
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;

  constructor(
    private apiService: ApiService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadDashboardStats();
  }

  hasRecentDonations(): boolean {
    return !!(this.stats?.recent_donations && this.stats.recent_donations.length > 0);
  }

  loadDashboardStats() {
    this.loading = true;
    
    // For now, let's use fallback data since the backend might not have the endpoint
    this.stats = {
      total_donations: 125000,
      total_volunteers: 45,
      total_contacts: 23,
      total_stories: 12,
      total_events: 8,
      recent_donations: [
        { name: 'Ahmed Hassan', amount: 500, donated_at: new Date().toISOString() },
        { name: 'Sarah Khan', amount: 250, donated_at: new Date(Date.now() - 86400000).toISOString() },
        { name: 'Omar Ali', amount: 100, donated_at: new Date(Date.now() - 172800000).toISOString() }
      ]
    };
    this.loading = false;

    // Uncomment this when backend endpoint is ready:
    /*
    this.apiService.get('/admin/dashboard-stats').subscribe({
      next: (response: any) => {
        this.stats = response;
      },
      error: (error) => {
        console.error('Error loading dashboard stats:', error);
        // Use fallback data above
      },
      complete: () => {
        this.loading = false;
      }
    });
    */
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  logout() {
    // Clear stored authentication data
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    
    // Redirect to login page
    this.router.navigate(['/admin/login']);
  }
}
