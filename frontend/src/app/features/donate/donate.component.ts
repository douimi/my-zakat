import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-donate',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="donate-page">
      <section class="donate-hero">
        <div class="hero-background">
          <img src="assets/images/fundraiser.jpg" alt="Make a Difference">
          <div class="hero-overlay"></div>
        </div>
        <div class="container">
          <div class="hero-content">
            <h1>Your Generosity Changes Lives</h1>
            <p>Every donation, no matter the size, creates lasting impact in communities worldwide</p>
          </div>
        </div>
      </section>

      <section class="donation-form-section">
        <div class="container">
          <div class="donation-wrapper">
            <div class="donation-info">
              <h2>Where Your Donation Goes</h2>
              <div class="allocation-chart">
                <div class="allocation-item">
                  <div class="allocation-bar" style="width: 50%"></div>
                  <div class="allocation-details">
                    <span class="percentage">50%</span>
                    <span class="category">Family Support</span>
                  </div>
                </div>
                <div class="allocation-item">
                  <div class="allocation-bar" style="width: 30%"></div>
                  <div class="allocation-details">
                    <span class="percentage">30%</span>
                    <span class="category">Orphan Care</span>
                  </div>
                </div>
                <div class="allocation-item">
                  <div class="allocation-bar" style="width: 20%"></div>
                  <div class="allocation-details">
                    <span class="percentage">20%</span>
                    <span class="category">Food Programs</span>
                  </div>
                </div>
              </div>
              
              <div class="impact-examples">
                <h3>Your Impact</h3>
                <div class="impact-grid">
                  <div class="impact-card">
                    <div class="impact-amount">$25</div>
                    <div class="impact-desc">Feeds a family for a week</div>
                  </div>
                  <div class="impact-card">
                    <div class="impact-amount">$50</div>
                    <div class="impact-desc">Provides school supplies for 5 children</div>
                  </div>
                  <div class="impact-card">
                    <div class="impact-amount">$100</div>
                    <div class="impact-desc">Sponsors a child's education for a month</div>
                  </div>
                  <div class="impact-card">
                    <div class="impact-amount">$500</div>
                    <div class="impact-desc">Supports a family for 3 months</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="donation-form">
              <h2>Make Your Donation</h2>
              
              <form (submit)="processDonation($event)">
                <div class="amount-selection">
                  <h3>Select Amount</h3>
                  <div class="amount-options">
                    <button type="button" 
                            *ngFor="let amount of presetAmounts"
                            [class.selected]="donationAmount === amount"
                            (click)="selectAmount(amount)"
                            class="amount-btn">
                      \${{amount}}
                    </button>
                  </div>
                  <div class="custom-amount">
                    <label>Or enter custom amount:</label>
                    <input type="number" 
                           [(ngModel)]="customAmount"
                           name="customAmount"
                           (input)="onCustomAmountChange()"
                           placeholder="Enter amount"
                           min="1">
                  </div>
                </div>
                
                <div class="frequency-selection">
                  <h3>Donation Frequency</h3>
                  <div class="frequency-options">
                    <label class="frequency-option" *ngFor="let freq of frequencies">
                      <input type="radio" 
                             name="frequency" 
                             [value]="freq.value"
                             [(ngModel)]="frequency">
                      <span class="option-label">{{freq.label}}</span>
                      <span class="option-desc" *ngIf="freq.desc">{{freq.desc}}</span>
                    </label>
                  </div>
                </div>
                
                <div class="donor-info">
                  <h3>Your Information</h3>
                  <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" 
                           [(ngModel)]="donorInfo.name"
                           name="name"
                           required>
                  </div>
                  <div class="form-group">
                    <label>Email Address *</label>
                    <input type="email" 
                           [(ngModel)]="donorInfo.email"
                           name="email"
                           required>
                  </div>
                  <div class="form-group">
                    <label>Phone (Optional)</label>
                    <input type="tel" 
                           [(ngModel)]="donorInfo.phone"
                           name="phone">
                  </div>
                </div>
                
                <div class="payment-section">
                  <h3>Payment Method</h3>
                  <div id="card-element" class="card-element"></div>
                  <div id="card-errors" class="card-errors" *ngIf="cardError">{{cardError}}</div>
                </div>
                
                <div class="form-actions">
                  <button type="submit" 
                          class="btn btn-primary btn-large"
                          [disabled]="processing">
                    <span *ngIf="!processing">Donate \${{donationAmount || 0}}</span>
                    <span *ngIf="processing">Processing...</span>
                  </button>
                  <p class="secure-note">
                    <i class="lock-icon">🔒</i> Your payment is secure and encrypted
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['./donate.component.scss']
})
export class DonateComponent implements OnInit {
  presetAmounts = [25, 50, 100, 250, 500, 1000];
  frequencies = [
    { value: 'one-time', label: 'One-Time', desc: 'Single donation' },
    { value: 'monthly', label: 'Monthly', desc: 'Recurring monthly donation' },
    { value: 'yearly', label: 'Yearly', desc: 'Annual contribution' }
  ];
  
  donationAmount: number = 100;
  customAmount: number | null = null;
  frequency: string = 'one-time';
  donorInfo = {
    name: '',
    email: '',
    phone: ''
  };
  
  stripe: Stripe | null = null;
  elements: StripeElements | null = null;
  cardElement: any = null;
  processing = false;
  cardError = '';

  constructor(private apiService: ApiService) {}

  async ngOnInit() {
    await this.initializeStripe();
  }

  async initializeStripe() {
    this.stripe = await loadStripe(environment.stripePublicKey);
    if (this.stripe) {
      this.elements = this.stripe.elements();
      this.setupCardElement();
    }
  }

  setupCardElement() {
    const style = {
      base: {
        fontSize: '16px',
        color: '#32325d',
        '::placeholder': {
          color: '#aab7c4'
        }
      }
    };
    
    this.cardElement = this.elements?.create('card', { style });
    this.cardElement?.mount('#card-element');
    
    this.cardElement?.on('change', (event: any) => {
      this.cardError = event.error ? event.error.message : '';
    });
  }

  selectAmount(amount: number) {
    this.donationAmount = amount;
    this.customAmount = null;
  }

  onCustomAmountChange() {
    if (this.customAmount) {
      this.donationAmount = this.customAmount;
    }
  }

  async processDonation(event: Event) {
    event.preventDefault();
    
    if (!this.stripe || !this.cardElement) {
      return;
    }
    
    this.processing = true;
    this.cardError = '';
    
    try {
      // Create payment intent
      const response = await this.apiService.post('/donations/create-payment-intent', {
        amount: this.donationAmount,
        name: this.donorInfo.name,
        email: this.donorInfo.email,
        frequency: this.frequency
      }).toPromise();
      
      // Confirm payment
      const result = await this.stripe.confirmCardPayment((response as any).clientSecret, {
        payment_method: {
          card: this.cardElement,
          billing_details: {
            name: this.donorInfo.name,
            email: this.donorInfo.email
          }
        }
      });
      
      if (result.error) {
        this.cardError = result.error.message || 'Payment failed';
      } else {
        // Payment successful
        await this.saveDonation(result.paymentIntent.id);
        // Redirect to thank you page
        window.location.href = '/donate/thank-you';
      }
    } catch (error) {
      this.cardError = 'An error occurred. Please try again.';
    } finally {
      this.processing = false;
    }
  }

  async saveDonation(paymentId: string) {
    await this.apiService.post('/donations/create', {
      name: this.donorInfo.name,
      email: this.donorInfo.email,
      amount: this.donationAmount,
      frequency: this.frequency,
      payment_id: paymentId
    }).toPromise();
  }
}
