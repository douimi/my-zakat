import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-stories-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `<div class="stories-page"><h1>Success Stories</h1><p>Stories coming soon...</p></div>`,
  styles: [`.stories-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class StoriesListComponent {}
