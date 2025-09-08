import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-story-detail',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="story-detail"><h1>Story Detail</h1></div>`,
  styles: [`.story-detail { padding: 2rem; min-height: 60vh; }`]
})
export class StoryDetailComponent {}
