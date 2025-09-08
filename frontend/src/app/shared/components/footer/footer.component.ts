import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <footer class="footer">
      <div class="footer-top">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-column">
              <div class="footer-brand">
                <img src="assets/images/logo.png" alt="MyZakat Foundation" />
                <h3>MyZakat Foundation</h3>
              </div>
              <p class="footer-desc">
                Transforming lives through Zakat. Join us in making a lasting impact on communities worldwide.
              </p>
              <div class="social-links">
                <a href="#" aria-label="Facebook" class="social-link">
                  <i class="fab fa-facebook-f"></i>
                </a>
                <a href="#" aria-label="Twitter" class="social-link">
                  <i class="fab fa-twitter"></i>
                </a>
                <a href="#" aria-label="Instagram" class="social-link">
                  <i class="fab fa-instagram"></i>
                </a>
                <a href="#" aria-label="LinkedIn" class="social-link">
                  <i class="fab fa-linkedin-in"></i>
                </a>
              </div>
            </div>
            
            <div class="footer-column">
              <h4>Quick Links</h4>
              <ul class="footer-links">
                <li><a routerLink="/about">About Us</a></li>
                <li><a routerLink="/stories">Success Stories</a></li>
                <li><a routerLink="/events">Events</a></li>
                <li><a routerLink="/volunteer">Volunteer</a></li>
                <li><a routerLink="/contact">Contact</a></li>
              </ul>
            </div>
            
            <div class="footer-column">
              <h4>Our Programs</h4>
              <ul class="footer-links">
                <li><a href="#">Feed the Hungry</a></li>
                <li><a href="#">Support Families</a></li>
                <li><a href="#">Sponsor Orphans</a></li>
                <li><a href="#">Ramadan Campaign</a></li>
                <li><a href="#">Emergency Relief</a></li>
              </ul>
            </div>
            
            <div class="footer-column">
              <h4>Newsletter</h4>
              <p>Subscribe to receive updates about our work and impact.</p>
              <form class="newsletter-form" (submit)="subscribeNewsletter($event)">
                <input 
                  type="email" 
                  [(ngModel)]="email" 
                  name="email"
                  placeholder="Your email address" 
                  required
                  class="newsletter-input"
                />
                <button type="submit" class="btn btn-primary">Subscribe</button>
              </form>
              <p class="newsletter-note">We respect your privacy. Unsubscribe anytime.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="footer-bottom">
        <div class="container">
          <div class="footer-bottom-content">
            <p>&copy; 2024 MyZakat Foundation. All rights reserved.</p>
            <div class="footer-bottom-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .footer {
      background: linear-gradient(135deg, var(--dark-gray) 0%, #1a1a2e 100%);
      color: white;
      margin-top: auto;
    }
    
    .footer-top {
      padding: 4rem 0 3rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .footer-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 2fr;
      gap: 3rem;
      
      @media (max-width: 992px) {
        grid-template-columns: repeat(2, 1fr);
        gap: 2rem;
      }
      
      @media (max-width: 576px) {
        grid-template-columns: 1fr;
      }
    }
    
    .footer-column {
      h4 {
        font-size: 1.25rem;
        margin-bottom: 1.5rem;
        color: var(--accent-yellow);
        font-family: 'Poppins', sans-serif;
      }
    }
    
    .footer-brand {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      
      img {
        height: 50px;
        width: auto;
      }
      
      h3 {
        font-family: 'Playfair Display', serif;
        font-size: 1.5rem;
        margin: 0;
      }
    }
    
    .footer-desc {
      margin-bottom: 1.5rem;
      line-height: 1.6;
      opacity: 0.9;
    }
    
    .social-links {
      display: flex;
      gap: 1rem;
      
      .social-link {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        transition: all 0.3s;
        
        &:hover {
          background: var(--primary-blue);
          transform: translateY(-3px);
        }
      }
    }
    
    .footer-links {
      list-style: none;
      padding: 0;
      margin: 0;
      
      li {
        margin-bottom: 0.75rem;
        
        a {
          color: rgba(255, 255, 255, 0.8);
          text-decoration: none;
          transition: all 0.3s;
          position: relative;
          padding-left: 0;
          
          &::before {
            content: '→';
            position: absolute;
            left: -20px;
            opacity: 0;
            transition: all 0.3s;
          }
          
          &:hover {
            color: var(--accent-yellow);
            padding-left: 20px;
            
            &::before {
              left: 0;
              opacity: 1;
            }
          }
        }
      }
    }
    
    .newsletter-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin: 1rem 0;
      
      .newsletter-input {
        padding: 0.75rem 1rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border-radius: 8px;
        transition: all 0.3s;
        
        &::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }
        
        &:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.15);
          border-color: var(--accent-yellow);
        }
      }
      
      .btn {
        width: 100%;
      }
    }
    
    .newsletter-note {
      font-size: 0.875rem;
      opacity: 0.7;
      margin-top: 0.5rem;
    }
    
    .footer-bottom {
      padding: 1.5rem 0;
      background: rgba(0, 0, 0, 0.2);
    }
    
    .footer-bottom-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      
      p {
        margin: 0;
        opacity: 0.8;
      }
      
      @media (max-width: 768px) {
        flex-direction: column;
        text-align: center;
      }
    }
    
    .footer-bottom-links {
      display: flex;
      gap: 2rem;
      
      a {
        color: rgba(255, 255, 255, 0.8);
        text-decoration: none;
        transition: color 0.3s;
        
        &:hover {
          color: var(--accent-yellow);
        }
      }
    }
  `]
})
export class FooterComponent {
  email = '';

  subscribeNewsletter(event: Event) {
    event.preventDefault();
    // TODO: Implement newsletter subscription
    console.log('Newsletter subscription:', this.email);
    this.email = '';
  }
}
