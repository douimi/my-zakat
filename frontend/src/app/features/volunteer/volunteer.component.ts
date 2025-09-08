import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-volunteer',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="volunteer-page"><h1>Volunteer With Us</h1><p>Volunteer opportunities coming soon...</p></div>`,
  styles: [`.volunteer-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class VolunteerComponent {}
