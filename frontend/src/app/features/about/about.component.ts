import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="about-page"><h1>About MyZakat Foundation</h1><p>Learn more about our mission...</p></div>`,
  styles: [`.about-page { padding: 2rem; text-align: center; min-height: 60vh; }`]
})
export class AboutComponent {}
