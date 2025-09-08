import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="header" [class.scrolled]="isScrolled">
      <nav class="navbar container">
        <div class="nav-brand">
          <a routerLink="/" class="logo">
            <img src="assets/images/logo.png" alt="MyZakat Foundation" />
            <span class="logo-text">MyZakat</span>
          </a>
        </div>
        
        <button class="mobile-toggle" (click)="toggleMobile()" [class.active]="isMobileMenuOpen">
          <span></span>
          <span></span>
          <span></span>
        </button>
        
        <ul class="nav-menu" [class.active]="isMobileMenuOpen">
          <li class="nav-item">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" 
               class="nav-link" (click)="closeMobileMenu()">Home</a>
          </li>
          <li class="nav-item">
            <a routerLink="/about" routerLinkActive="active" class="nav-link" 
               (click)="closeMobileMenu()">About</a>
          </li>
          <li class="nav-item dropdown">
            <a class="nav-link" (click)="toggleDropdown('programs')">
              Programs <i class="arrow-down"></i>
            </a>
            <ul class="dropdown-menu" [class.show]="activeDropdown === 'programs'">
              <li><a routerLink="/stories" (click)="closeMobileMenu()">Success Stories</a></li>
              <li><a routerLink="/events" (click)="closeMobileMenu()">Events</a></li>
              <li><a routerLink="/testimonials" (click)="closeMobileMenu()">Testimonials</a></li>
            </ul>
          </li>
          <li class="nav-item dropdown">
            <a class="nav-link" (click)="toggleDropdown('zakat')">
              Zakat <i class="arrow-down"></i>
            </a>
            <ul class="dropdown-menu" [class.show]="activeDropdown === 'zakat'">
              <li><a routerLink="/zakat-calculator" (click)="closeMobileMenu()">Zakat Calculator</a></li>
              <li><a routerLink="/zakat-education" (click)="closeMobileMenu()">Zakat Education</a></li>
            </ul>
          </li>
          <li class="nav-item">
            <a routerLink="/volunteer" routerLinkActive="active" class="nav-link" 
               (click)="closeMobileMenu()">Volunteer</a>
          </li>
          <li class="nav-item">
            <a routerLink="/contact" routerLinkActive="active" class="nav-link" 
               (click)="closeMobileMenu()">Contact</a>
          </li>
          <li class="nav-item nav-cta">
            <a routerLink="/donate" class="btn btn-primary" (click)="closeMobileMenu()">
              Donate Now
            </a>
          </li>
        </ul>
      </nav>
    </header>
  `,
  styles: [`
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      z-index: 1000;
      transition: all 0.3s ease;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
      
      &.scrolled {
        background: white;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      }
    }
    
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      height: 80px;
    }
    
    .nav-brand {
      .logo {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        text-decoration: none;
        
        img {
          height: 50px;
          width: auto;
        }
        
        .logo-text {
          font-family: 'Playfair Display', serif;
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--primary-blue);
        }
      }
    }
    
    .mobile-toggle {
      display: none;
      flex-direction: column;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      
      span {
        width: 25px;
        height: 3px;
        background: var(--primary-blue);
        margin: 3px 0;
        transition: 0.3s;
        border-radius: 2px;
      }
      
      &.active {
        span:nth-child(1) {
          transform: rotate(-45deg) translate(-6px, 6px);
        }
        span:nth-child(2) {
          opacity: 0;
        }
        span:nth-child(3) {
          transform: rotate(45deg) translate(-6px, -6px);
        }
      }
    }
    
    .nav-menu {
      display: flex;
      align-items: center;
      list-style: none;
      gap: 2rem;
      margin: 0;
      padding: 0;
    }
    
    .nav-item {
      position: relative;
      
      &.dropdown {
        .arrow-down {
          display: inline-block;
          margin-left: 0.25rem;
          transition: transform 0.3s;
        }
        
        &:hover .dropdown-menu,
        .dropdown-menu.show {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
      }
    }
    
    .nav-link {
      color: var(--text-dark);
      text-decoration: none;
      font-weight: 500;
      padding: 0.5rem 0;
      position: relative;
      cursor: pointer;
      transition: color 0.3s;
      
      &::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        width: 0;
        height: 2px;
        background: var(--primary-blue);
        transition: width 0.3s;
      }
      
      &:hover,
      &.active {
        color: var(--primary-blue);
        
        &::after {
          width: 100%;
        }
      }
    }
    
    .dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      min-width: 200px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      padding: 1rem 0;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.3s;
      margin-top: 0.5rem;
      
      li {
        list-style: none;
        
        a {
          display: block;
          padding: 0.75rem 1.5rem;
          color: var(--text-dark);
          text-decoration: none;
          transition: all 0.3s;
          
          &:hover {
            background: var(--light-gray);
            color: var(--primary-blue);
            padding-left: 2rem;
          }
        }
      }
    }
    
    .nav-cta {
      margin-left: 1rem;
      
      .btn {
        padding: 0.625rem 1.5rem;
      }
    }
    
    @media (max-width: 768px) {
      .mobile-toggle {
        display: flex;
      }
      
      .nav-menu {
        position: fixed;
        left: -100%;
        top: 80px;
        flex-direction: column;
        background: white;
        width: 100%;
        text-align: center;
        transition: 0.3s;
        box-shadow: 0 10px 27px rgba(0, 0, 0, 0.05);
        padding: 2rem 0;
        gap: 0;
        max-height: calc(100vh - 80px);
        overflow-y: auto;
        
        &.active {
          left: 0;
        }
      }
      
      .nav-item {
        width: 100%;
        
        &.dropdown {
          .dropdown-menu {
            position: static;
            opacity: 1;
            visibility: visible;
            transform: none;
            box-shadow: none;
            background: var(--light-gray);
            display: none;
            
            &.show {
              display: block;
            }
          }
        }
      }
      
      .nav-link {
        display: block;
        padding: 1rem;
        
        &::after {
          display: none;
        }
      }
      
      .nav-cta {
        margin: 1rem 0 0;
        padding: 0 1rem;
      }
    }
  `]
})
export class HeaderComponent {
  isScrolled = false;
  isMobileMenuOpen = false;
  activeDropdown: string | null = null;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 50;
  }

  toggleMobile() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
    this.activeDropdown = null;
  }

  toggleDropdown(dropdown: string) {
    this.activeDropdown = this.activeDropdown === dropdown ? null : dropdown;
  }
}
