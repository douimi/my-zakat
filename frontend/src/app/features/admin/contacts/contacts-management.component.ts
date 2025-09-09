import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

interface Contact {
  id?: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_resolved: boolean;
  created_at?: string;
}

interface Subscription {
  id?: number;
  email: string;
  is_active: boolean;
  created_at?: string;
}

@Component({
  selector: 'app-contacts-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Messages & Subscriptions</h1>
        <div class="stats-summary">
          <div class="stat-item">
            <span class="stat-number">{{getUnresolvedCount()}}</span>
            <span class="stat-label">Unresolved</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{contacts.length}}</span>
            <span class="stat-label">Total Messages</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{getActiveSubscriptions()}}</span>
            <span class="stat-label">Subscribers</span>
          </div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button class="tab-button" 
                [class.active]="activeTab === 'contacts'"
                (click)="setActiveTab('contacts')">
          <i class="fas fa-envelope"></i>
          Contact Messages
        </button>
        <button class="tab-button" 
                [class.active]="activeTab === 'subscriptions'"
                (click)="setActiveTab('subscriptions')">
          <i class="fas fa-users"></i>
          Newsletter Subscriptions
        </button>
      </div>

      <!-- Contact Messages Tab -->
      <div *ngIf="activeTab === 'contacts'" class="tab-content">
        <!-- Filter Tabs -->
        <div class="filter-tabs">
          <button class="tab-button" 
                  [class.active]="contactFilter === 'all'"
                  (click)="setContactFilter('all')">
            All Messages
          </button>
          <button class="tab-button" 
                  [class.active]="contactFilter === 'unresolved'"
                  (click)="setContactFilter('unresolved')">
            Unresolved ({{getUnresolvedCount()}})
          </button>
          <button class="tab-button" 
                  [class.active]="contactFilter === 'resolved'"
                  (click)="setContactFilter('resolved')">
            Resolved
          </button>
        </div>

        <div class="content-card">
          <div class="messages-list">
            <div *ngFor="let contact of filteredContacts" 
                 class="message-card" 
                 [class.unresolved]="!contact.is_resolved">
              
              <div class="message-header">
                <div class="sender-info">
                  <h4>{{contact.name}}</h4>
                  <p><i class="fas fa-envelope"></i> {{contact.email}}</p>
                </div>
                <div class="message-meta">
                  <span class="status-badge" [class.resolved]="contact.is_resolved" [class.unresolved]="!contact.is_resolved">
                    {{contact.is_resolved ? 'Resolved' : 'Unresolved'}}
                  </span>
                  <span class="date">{{formatDate(contact.created_at)}}</span>
                </div>
              </div>

              <div class="message-subject">
                <strong>Subject:</strong> {{contact.subject}}
              </div>

              <div class="message-content">
                <p>{{contact.message}}</p>
              </div>

              <div class="message-actions">
                <button class="btn btn-sm" 
                        [class.btn-primary]="!contact.is_resolved"
                        [class.btn-secondary]="contact.is_resolved"
                        (click)="toggleResolved(contact)">
                  <i class="fas" [class.fa-check]="!contact.is_resolved" [class.fa-undo]="contact.is_resolved"></i>
                  {{contact.is_resolved ? 'Mark Unresolved' : 'Mark Resolved'}}
                </button>
                <button class="btn btn-sm btn-outline" (click)="replyToContact(contact)">
                  <i class="fas fa-reply"></i>
                  Reply
                </button>
                <button class="btn btn-sm btn-danger" (click)="deleteContact(contact)">
                  <i class="fas fa-trash"></i>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Newsletter Subscriptions Tab -->
      <div *ngIf="activeTab === 'subscriptions'" class="tab-content">
        <div class="content-card">
          <div class="subscriptions-header">
            <h3>Newsletter Subscribers</h3>
            <button class="btn btn-primary" (click)="exportSubscribers()">
              <i class="fas fa-download"></i>
              Export List
            </button>
          </div>
          
          <div class="table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Email Address</th>
                  <th>Status</th>
                  <th>Subscribed Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let subscription of subscriptions" [class.inactive]="!subscription.is_active">
                  <td>{{subscription.email}}</td>
                  <td>
                    <span class="status-badge" [class.active]="subscription.is_active" [class.inactive]="!subscription.is_active">
                      {{subscription.is_active ? 'Active' : 'Unsubscribed'}}
                    </span>
                  </td>
                  <td>{{formatDate(subscription.created_at)}}</td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn-icon" 
                              [class.btn-toggle]="subscription.is_active"
                              [class.btn-activate]="!subscription.is_active"
                              (click)="toggleSubscription(subscription)" 
                              [title]="subscription.is_active ? 'Unsubscribe' : 'Reactivate'">
                        <i class="fas" [class.fa-eye-slash]="subscription.is_active" [class.fa-eye]="!subscription.is_active"></i>
                      </button>
                      <button class="btn-icon btn-delete" (click)="deleteSubscription(subscription)" title="Delete">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading data...</p>
      </div>
    </div>
  `,
  styleUrls: ['../stories/stories-management.component.scss', './contacts-management.component.scss']
})
export class ContactsManagementComponent implements OnInit {
  contacts: Contact[] = [];
  subscriptions: Subscription[] = [];
  filteredContacts: Contact[] = [];
  loading = true;
  activeTab = 'contacts';
  contactFilter = 'all';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading = true;
    
    // Sample data for development
    setTimeout(() => {
      this.contacts = [
        {
          id: 1,
          name: "Ahmed Hassan",
          email: "ahmed.hassan@email.com",
          subject: "Question about Zakat calculation",
          message: "I'm trying to calculate my Zakat for this year and have some questions about what assets to include. Can someone help me understand the process better?",
          is_resolved: false,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          name: "Sarah Khan",
          email: "sarah.khan@email.com",
          subject: "Volunteer opportunity inquiry",
          message: "I'm interested in volunteering for your upcoming food drive event. What are the requirements and how can I sign up?",
          is_resolved: true,
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 3,
          name: "Omar Ali",
          email: "omar.ali@email.com",
          subject: "Donation receipt request",
          message: "I made a donation last month but haven't received my tax receipt yet. Could you please send it to me?",
          is_resolved: false,
          created_at: new Date(Date.now() - 172800000).toISOString()
        },
        {
          id: 4,
          name: "Fatima Mohamed",
          email: "fatima.mohamed@email.com",
          subject: "Thank you message",
          message: "I wanted to thank you for the help my family received during our difficult time. Your organization truly makes a difference in our community.",
          is_resolved: true,
          created_at: new Date(Date.now() - 259200000).toISOString()
        }
      ];

      this.subscriptions = [
        {
          id: 1,
          email: "subscriber1@email.com",
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          email: "subscriber2@email.com",
          is_active: true,
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 3,
          email: "unsubscribed@email.com",
          is_active: false,
          created_at: new Date(Date.now() - 172800000).toISOString()
        },
        {
          id: 4,
          email: "newsletter.fan@email.com",
          is_active: true,
          created_at: new Date(Date.now() - 259200000).toISOString()
        }
      ];

      this.filterContacts();
      this.loading = false;
    }, 1000);
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  setContactFilter(filter: string) {
    this.contactFilter = filter;
    this.filterContacts();
  }

  filterContacts() {
    switch (this.contactFilter) {
      case 'unresolved':
        this.filteredContacts = this.contacts.filter(c => !c.is_resolved);
        break;
      case 'resolved':
        this.filteredContacts = this.contacts.filter(c => c.is_resolved);
        break;
      default:
        this.filteredContacts = [...this.contacts];
    }
  }

  getUnresolvedCount(): number {
    return this.contacts.filter(c => !c.is_resolved).length;
  }

  getActiveSubscriptions(): number {
    return this.subscriptions.filter(s => s.is_active).length;
  }

  toggleResolved(contact: Contact) {
    contact.is_resolved = !contact.is_resolved;
    this.filterContacts();
  }

  replyToContact(contact: Contact) {
    // Open default email client
    const subject = encodeURIComponent(`Re: ${contact.subject}`);
    const body = encodeURIComponent(`Dear ${contact.name},\n\nThank you for contacting us.\n\nBest regards,\nMyZakat Foundation Team`);
    window.open(`mailto:${contact.email}?subject=${subject}&body=${body}`);
  }

  deleteContact(contact: Contact) {
    if (confirm(`Are you sure you want to delete the message from "${contact.name}"?`)) {
      this.contacts = this.contacts.filter(c => c.id !== contact.id);
      this.filterContacts();
    }
  }

  toggleSubscription(subscription: Subscription) {
    subscription.is_active = !subscription.is_active;
  }

  deleteSubscription(subscription: Subscription) {
    if (confirm(`Are you sure you want to delete the subscription for "${subscription.email}"?`)) {
      this.subscriptions = this.subscriptions.filter(s => s.id !== subscription.id);
    }
  }

  exportSubscribers() {
    const activeSubscribers = this.subscriptions.filter(s => s.is_active);
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Email,Subscribed Date\n"
      + activeSubscribers.map(s => `${s.email},${this.formatDate(s.created_at)}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "newsletter_subscribers.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
