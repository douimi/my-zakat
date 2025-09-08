import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="login-page"><h1>Admin Login</h1></div>`,
  styles: [`.login-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class LoginComponent {}
