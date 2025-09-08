import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-events-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `<div class="events-page"><h1>Upcoming Events</h1><p>Events coming soon...</p></div>`,
  styles: [`.events-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class EventsListComponent {}
