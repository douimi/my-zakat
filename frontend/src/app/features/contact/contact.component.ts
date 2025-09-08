import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="contact-page"><h1>Contact Us</h1><p>Contact form coming soon...</p></div>`,
  styles: [`.contact-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class ContactComponent {}
