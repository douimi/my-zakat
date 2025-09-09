import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

interface Donation {
  id?: number;
  name: string;
  email: string;
  amount: number;
  donation_type: string;
  payment_method: string;
  status: 'completed' | 'pending' | 'failed';
  donated_at?: string;
  receipt_sent?: boolean;
}

@Component({
  selector: 'app-donations-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h1>Donation Management</h1>
        <div class="stats-summary">
          <div class="stat-item">
            <span class="stat-number">\${{getTotalAmount() | number:'1.2-2'}}</span>
            <span class="stat-label">Total Raised</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{donations.length}}</span>
            <span class="stat-label">Donations</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{getPendingReceipts()}}</span>
            <span class="stat-label">Pending Receipts</span>
          </div>
        </div>
      </div>

      <!-- Filter and Export Controls -->
      <div class="controls-bar">
        <div class="filter-tabs">
          <button class="tab-button" 
                  [class.active]="activeFilter === 'all'"
                  (click)="setActiveFilter('all')">
            All Donations
          </button>
          <button class="tab-button" 
                  [class.active]="activeFilter === 'completed'"
                  (click)="setActiveFilter('completed')">
            Completed
          </button>
          <button class="tab-button" 
                  [class.active]="activeFilter === 'pending'"
                  (click)="setActiveFilter('pending')">
            Pending
          </button>
          <button class="tab-button" 
                  [class.active]="activeFilter === 'failed'"
                  (click)="setActiveFilter('failed')">
            Failed
          </button>
        </div>
        
        <div class="export-controls">
          <button class="btn btn-outline" (click)="exportDonations()">
            <i class="fas fa-download"></i>
            Export CSV
          </button>
        </div>
      </div>

      <!-- Donations Table -->
      <div class="content-card">
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Donor Information</th>
                <th>Donation Details</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let donation of filteredDonations" [class]="'status-' + donation.status">
                <td>
                  <div class="donor-info">
                    <h4>{{donation.name}}</h4>
                    <p><i class="fas fa-envelope"></i> {{donation.email}}</p>
                  </div>
                </td>
                <td>
                  <div class="donation-details">
                    <div class="donation-type">
                      <strong>{{donation.donation_type}}</strong>
                    </div>
                    <div class="payment-method">
                      <i class="fas" [class.fa-credit-card]="donation.payment_method === 'card'" 
                         [class.fa-university]="donation.payment_method === 'bank'" 
                         [class.fa-paypal]="donation.payment_method === 'paypal'"></i>
                      {{donation.payment_method | titlecase}}
                    </div>
                  </div>
                </td>
                <td>
                  <div class="amount">
                    <span class="amount-value">\${{donation.amount | number:'1.2-2'}}</span>
                  </div>
                </td>
                <td>
                  <span class="status-badge" [class]="'status-' + donation.status">
                    {{donation.status | titlecase}}
                  </span>
                </td>
                <td>{{formatDate(donation.donated_at)}}</td>
                <td>
                  <div class="receipt-status">
                    <span *ngIf="donation.receipt_sent" class="receipt-sent">
                      <i class="fas fa-check-circle"></i> Sent
                    </span>
                    <span *ngIf="!donation.receipt_sent" class="receipt-pending">
                      <i class="fas fa-clock"></i> Pending
                    </span>
                  </div>
                </td>
                <td>
                  <div class="action-buttons">
                    <button *ngIf="!donation.receipt_sent && donation.status === 'completed'" 
                            class="btn-icon btn-receipt" 
                            (click)="sendReceipt(donation)" 
                            title="Send Receipt">
                      <i class="fas fa-file-invoice"></i>
                    </button>
                    <button class="btn-icon btn-email" 
                            (click)="contactDonor(donation)" 
                            title="Contact Donor">
                      <i class="fas fa-envelope"></i>
                    </button>
                    <button *ngIf="donation.status === 'failed'" 
                            class="btn-icon btn-retry" 
                            (click)="retryPayment(donation)" 
                            title="Retry Payment">
                      <i class="fas fa-redo"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary Charts (Placeholder) -->
      <div class="charts-section">
        <div class="chart-card">
          <h3>Monthly Donation Trends</h3>
          <div class="chart-placeholder">
            <i class="fas fa-chart-line"></i>
            <p>Chart visualization would go here</p>
            <small>Integration with charting library needed</small>
          </div>
        </div>
        
        <div class="chart-card">
          <h3>Donation Types Breakdown</h3>
          <div class="chart-placeholder">
            <i class="fas fa-chart-pie"></i>
            <p>Pie chart would go here</p>
            <small>Integration with charting library needed</small>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-overlay" *ngIf="loading">
        <div class="loading-spinner"></div>
        <p>Loading donations...</p>
      </div>
    </div>
  `,
  styleUrls: ['../stories/stories-management.component.scss', './donations-management.component.scss']
})
export class DonationsManagementComponent implements OnInit {
  donations: Donation[] = [];
  filteredDonations: Donation[] = [];
  loading = true;
  activeFilter = 'all';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadDonations();
  }

  loadDonations() {
    this.loading = true;
    
    // Sample data for development
    setTimeout(() => {
      this.donations = [
        {
          id: 1,
          name: "Ahmed Hassan",
          email: "ahmed.hassan@email.com",
          amount: 500,
          donation_type: "Zakat",
          payment_method: "card",
          status: 'completed',
          donated_at: new Date().toISOString(),
          receipt_sent: true
        },
        {
          id: 2,
          name: "Sarah Khan",
          email: "sarah.khan@email.com",
          amount: 250,
          donation_type: "Sadaqah",
          payment_method: "paypal",
          status: 'completed',
          donated_at: new Date(Date.now() - 86400000).toISOString(),
          receipt_sent: false
        },
        {
          id: 3,
          name: "Omar Ali",
          email: "omar.ali@email.com",
          amount: 100,
          donation_type: "General",
          payment_method: "bank",
          status: 'pending',
          donated_at: new Date(Date.now() - 172800000).toISOString(),
          receipt_sent: false
        },
        {
          id: 4,
          name: "Fatima Mohamed",
          email: "fatima.mohamed@email.com",
          amount: 75,
          donation_type: "Emergency Relief",
          payment_method: "card",
          status: 'failed',
          donated_at: new Date(Date.now() - 259200000).toISOString(),
          receipt_sent: false
        },
        {
          id: 5,
          name: "Hassan Ahmed",
          email: "hassan.ahmed@email.com",
          amount: 1000,
          donation_type: "Zakat",
          payment_method: "bank",
          status: 'completed',
          donated_at: new Date(Date.now() - 345600000).toISOString(),
          receipt_sent: true
        }
      ];
      this.filterDonations();
      this.loading = false;
    }, 1000);
  }

  setActiveFilter(filter: string) {
    this.activeFilter = filter;
    this.filterDonations();
  }

  filterDonations() {
    if (this.activeFilter === 'all') {
      this.filteredDonations = [...this.donations];
    } else {
      this.filteredDonations = this.donations.filter(d => d.status === this.activeFilter);
    }
  }

  getTotalAmount(): number {
    return this.donations
      .filter(d => d.status === 'completed')
      .reduce((total, d) => total + d.amount, 0);
  }

  getPendingReceipts(): number {
    return this.donations.filter(d => d.status === 'completed' && !d.receipt_sent).length;
  }

  sendReceipt(donation: Donation) {
    if (confirm(`Send tax receipt to ${donation.name}?`)) {
      donation.receipt_sent = true;
      // Here you would integrate with your email service
      alert(`Receipt sent to ${donation.email}`);
    }
  }

  contactDonor(donation: Donation) {
    const subject = encodeURIComponent(`Thank you for your donation - MyZakat Foundation`);
    const body = encodeURIComponent(`Dear ${donation.name},\n\nThank you for your generous donation of $${donation.amount}.\n\nBest regards,\nMyZakat Foundation Team`);
    window.open(`mailto:${donation.email}?subject=${subject}&body=${body}`);
  }

  retryPayment(donation: Donation) {
    if (confirm(`Retry payment processing for ${donation.name}'s donation?`)) {
      donation.status = 'pending';
      // Here you would integrate with your payment processor
      alert('Payment retry initiated');
    }
  }

  exportDonations() {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Name,Email,Amount,Type,Payment Method,Status,Date,Receipt Sent\n"
      + this.filteredDonations.map(d => 
          `"${d.name}","${d.email}",${d.amount},"${d.donation_type}","${d.payment_method}","${d.status}","${this.formatDate(d.donated_at)}","${d.receipt_sent ? 'Yes' : 'No'}"`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `donations_${this.activeFilter}_${new Date().toISOString().split('T')[0]}.csv`);
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
