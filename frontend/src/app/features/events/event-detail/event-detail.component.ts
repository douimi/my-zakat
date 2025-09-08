import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="event-detail"><h1>Event Detail</h1></div>`,
  styles: [`.event-detail { padding: 2rem; min-height: 60vh; }`]
})
export class EventDetailComponent {}
