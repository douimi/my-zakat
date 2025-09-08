import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="dashboard-page"><h1>Admin Dashboard</h1></div>`,
  styles: [`.dashboard-page { padding: 2rem; min-height: 60vh; }`]
})
export class DashboardComponent {}
