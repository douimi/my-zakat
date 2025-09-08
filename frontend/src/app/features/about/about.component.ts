import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="about-container">
      <h2>About Us</h2>
      <p>Learn more about our mission and how we impact lives around the world.</p>

      <!-- Our Mission Section -->
      <section class="about-section">
        <div class="about-text">
          <h3>Our Mission</h3>
          <p>
            The Zakat Distribution Foundation (ZDF) is dedicated to alleviating poverty, aiding those in distress,
            and empowering communities through Zakat and Sadaqa contributions. Established with the mission to serve
            humanity, we ensure that your donations are effectively utilized to bring hope and relief to the most
            vulnerable individuals worldwide.
          </p>
        </div>
        <div class="about-image">
          <img src="assets/images/aboutus/mission.jpg" alt="Our Mission">
        </div>
      </section>

      <!-- Our Vision Section -->
      <section class="about-section reverse">
        <div class="about-image">
          <img src="assets/images/aboutus/vision.jpg" alt="Our Vision">
        </div>
        <div class="about-text">
          <h3>Our Vision</h3>
          <p>To create a world where no one is left in poverty. We believe in providing assistance to all the needy of the world. No one should be hungry or thirsty, no one should live without shelter, and no one should suffer while others live comfortably.</p>
        </div>
      </section>

      <!-- Impact & Achievements Section -->
      <section class="about-section">
        <div class="about-text">
          <h3>Our Impact</h3>
          <ul>
            <li>10,000+ meals served</li>
            <li>2,000+ families supported</li>
            <li>500+ orphans sponsored</li>
          </ul>
        </div>
        <div class="about-image">
          <img src="assets/images/aboutus/impact1.jpg" alt="Impact Photo 1">
        </div>
      </section>

      <!-- Team Section -->
      <section class="about-section">
        <h3>Meet Our Team</h3>
        <div class="team-list animated-cards">
          <div class="team-member card">
            <div class="team-img-wrapper">
              <img src="assets/images/aboutus/team1.jpg" alt="Fatima Ali">
            </div>
            <h4>Fatima Ali</h4>
            <p class="team-role">Founder & Director</p>
            <p class="team-bio">Fatima is passionate about empowering communities and has led ZDF since its inception, ensuring every donation makes a real impact.</p>
          </div>
          <div class="team-member card">
            <div class="team-img-wrapper">
              <img src="assets/images/aboutus/team2.jpg" alt="Omar Khan">
            </div>
            <h4>Omar Khan</h4>
            <p class="team-role">Programs Lead</p>
            <p class="team-bio">Omar coordinates our outreach and relief programs, bringing innovative solutions to help those in need across the globe.</p>
          </div>
          <div class="team-member card">
            <div class="team-img-wrapper">
              <img src="assets/images/aboutus/team3.jpg" alt="Sara Yusuf">
            </div>
            <h4>Sara Yusuf</h4>
            <p class="team-role">Community Outreach</p>
            <p class="team-bio">Sara builds partnerships and connects with local communities, ensuring our support reaches the most vulnerable.</p>
          </div>
        </div>
      </section>

      <!-- Partners Section -->
      <section class="about-section partners-section">
        <h3>Our Partners</h3>
        <div class="partners-list">
          <div class="partner-card">
            <img src="assets/images/aboutus/partner1.jpg" alt="Relief Work Partner Logo">
            <div class="partner-info">
              <h4>Relief Work Partner</h4>
              <p>Collaborating to deliver emergency aid and disaster relief to communities in need.</p>
            </div>
          </div>
          <div class="partner-card">
            <img src="assets/images/aboutus/partner2.jpg" alt="Health Partner Logo">
            <div class="partner-info">
              <h4>Health Partner</h4>
              <p>Supporting health initiatives and medical outreach for vulnerable populations.</p>
            </div>
          </div>
          <div class="partner-card">
            <img src="assets/images/aboutus/partner3.jpg" alt="Education Partner Logo">
            <div class="partner-info">
              <h4>Education Partner</h4>
              <p>Empowering children and adults through access to quality education and resources.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Why Choose Us -->
      <section class="about-section">
        <div class="about-text">
          <h3>Why Choose ZDF?</h3>
          <ul>
            <li>✔ 100% Transparent Fund Allocation</li>
            <li>✔ Global Outreach to Needy Communities</li>
            <li>✔ Secure & Trusted Zakat Processing</li>
            <li>✔ Dedicated to Islamic Philanthropy</li>
          </ul>
        </div>
        <div class="about-image">
          <img src="assets/images/aboutus/impact2.jpg" alt="Impact Photo 2">
        </div>
      </section>

      <!-- Call to Action -->
      <section class="cta">
        <div class="cta-text">
          <h3>Join Us in Making a Difference</h3>
          <p>Your Zakat has the power to change lives. Be a part of this mission today!</p>
          <a routerLink="/donate" class="button">Donate Now</a>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['./about.component.scss']
})
export class AboutComponent {}
