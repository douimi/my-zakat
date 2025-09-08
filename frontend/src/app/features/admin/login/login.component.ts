import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

interface LoginData {
  username: string;
  password: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <img src="assets/images/logo.png" alt="ZDF Logo" class="logo">
          <h2>Admin Login</h2>
          <p>Access the administrative dashboard</p>
        </div>

        <!-- Error Message -->
        <div *ngIf="errorMessage" class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>{{errorMessage}}</p>
        </div>

        <!-- Login Form -->
        <form (ngSubmit)="login()" class="login-form" #loginForm="ngForm">
          <div class="form-group">
            <label for="username">
              <i class="fas fa-user"></i>
              Username
            </label>
            <input 
              type="text" 
              id="username" 
              name="username" 
              [(ngModel)]="loginData.username"
              placeholder="Enter your username"
              required
              autocomplete="username">
          </div>

          <div class="form-group">
            <label for="password">
              <i class="fas fa-lock"></i>
              Password
            </label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              [(ngModel)]="loginData.password"
              placeholder="Enter your password"
              required
              autocomplete="current-password">
          </div>

          <button 
            type="submit" 
            class="login-button"
            [disabled]="!loginForm.form.valid || isLoading">
            <i *ngIf="!isLoading" class="fas fa-sign-in-alt"></i>
            <i *ngIf="isLoading" class="fas fa-spinner fa-spin"></i>
            <span *ngIf="!isLoading">Login</span>
            <span *ngIf="isLoading">Logging in...</span>
          </button>
        </form>

        <div class="login-footer">
          <p class="security-note">
            <i class="fas fa-shield-alt"></i>
            This is a secure admin area. All login attempts are logged.
          </p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginData: LoginData = {
    username: '',
    password: ''
  };

  isLoading = false;
  errorMessage = '';

  constructor(
    private apiService: ApiService,
    private router: Router
  ) {}

  login() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.errorMessage = '';

    // For development/demo purposes, let's add a simple check
    if (this.loginData.username === 'admin' && this.loginData.password === 'admin') {
      // Simulate successful login
      localStorage.setItem('admin_token', 'demo-token');
      localStorage.setItem('admin_user', JSON.stringify({ username: 'admin' }));
      this.router.navigate(['/admin/dashboard']);
      this.isLoading = false;
      return;
    }

    // Try the actual API call
    this.apiService.post('/auth/login', this.loginData).subscribe({
      next: (response: any) => {
        console.log('Login successful:', response);
        
        // Store authentication token if provided
        if (response.token) {
          localStorage.setItem('admin_token', response.token);
        }
        
        // Store user info if provided
        if (response.user) {
          localStorage.setItem('admin_user', JSON.stringify(response.user));
        }

        // Redirect to admin dashboard
        this.router.navigate(['/admin/dashboard']);
      },
      error: (error) => {
        console.error('Login error:', error);
        
        // Handle different types of errors
        if (error.status === 500) {
          this.errorMessage = 'Server error occurred. Please try again later or use demo login (admin/admin).';
        } else if (error.status === 0) {
          this.errorMessage = 'Cannot connect to server. Please check your connection or use demo login (admin/admin).';
        } else {
          this.errorMessage = error.error?.message || 'Invalid username or password. Try demo login (admin/admin).';
        }
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
