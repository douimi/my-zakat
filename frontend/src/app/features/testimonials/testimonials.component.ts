import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="testimonials-page"><h1>Testimonials</h1><p>Testimonials coming soon...</p></div>`,
  styles: [`.testimonials-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class TestimonialsComponent {}
