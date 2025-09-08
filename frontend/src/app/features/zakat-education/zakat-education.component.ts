import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-zakat-education',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="zakat-education modern-education">
      <h2><i class="fas fa-balance-scale"></i> Understanding Zakat</h2>
      <p class="zakat-intro">Zakat is one of the five pillars of Islam and is obligatory for every eligible Muslim. It purifies wealth and uplifts communities.</p>

      <!-- Visual 5 Pillars -->
      <div class="pillars-visual">
        <img src="assets/images/5pillars.jpg" alt="Five Pillars of Islam">
        <div class="pillars-labels">
          <span>Shahada</span>
          <span>Salah</span>
          <span>Zakat</span>
          <span>Sawm</span>
          <span>Hajj</span>
        </div>
      </div>

      <!-- Eligibility Section -->
      <section class="zakat-section card">
        <h3><i class="fas fa-user-check"></i> Eligibility</h3>
        <ul>
          <li><strong>Who Pays:</strong> Sane, adult Muslims who own wealth above the Nisab.</li>
          <li><strong>Nisab:</strong> The minimum wealth required for Zakat is the value of 87.48g of gold or 612.36g of silver.</li>
          <li><strong>Payment Timing:</strong> Paid annually after one lunar year of exceeding Nisab.</li>
        </ul>
      </section>

      <!-- Assets Section -->
      <section class="zakat-section card">
        <h3><i class="fas fa-coins"></i> What Assets Are Eligible?</h3>
        <ul>
          <li><strong>Gold & Silver:</strong> Physical gold and silver in any form.</li>
          <li><strong>Cash & Savings:</strong> Including bank deposits, investments, and digital currency.</li>
          <li><strong>Livestock:</strong> Cattle, sheep, camels, and other livestock meeting minimum thresholds.</li>
          <li><strong>Agricultural Produce:</strong> Crops and farm yields.</li>
          <li><strong>Business Assets:</strong> Inventory and trade goods.</li>
        </ul>
      </section>

      <!-- Zakat Thresholds (Nisab) -->
      <section class="zakat-section card">
        <h3><i class="fas fa-gem"></i> Zakat Threshold (Nisab)</h3>
        <p>The minimum wealth before Zakat is due:</p>
        <ul>
          <li><strong>Gold:</strong> 85 grams</li>
          <li><strong>Silver:</strong> 595 grams</li>
        </ul>
      </section>

      <!-- Step-by-Step Example -->
      <section class="zakat-section card highlight">
        <h3><i class="fas fa-calculator"></i> Example: Zakat Calculation</h3>
        <ol>
          <li><strong>Total Assets:</strong> $10,000 (cash, gold, investments, etc.)</li>
          <li><strong>Debts:</strong> $2,000 (deductible debts)</li>
          <li><strong>Net Zakatable Wealth:</strong> $8,000</li>
          <li><strong>Zakat Due (2.5%):</strong> $8,000 × 0.025 = <b>$200</b></li>
        </ol>
        <a routerLink="/zakat-calculator" class="cta-button">Try Our Zakat Calculator</a>
      </section>

      <!-- Additional Considerations -->
      <section class="zakat-section card">
        <h3><i class="fas fa-info-circle"></i> Additional Considerations</h3>
        <ul>
          <li><strong>Exclusions:</strong> Personal necessities like homes, primary vehicles, and appliances are exempt.</li>
          <li><strong>Second Homes & Vehicles:</strong> If for investment or resale, they are Zakat-eligible.</li>
          <li><strong>Zakat al-Fitr:</strong> A separate form of Zakat to be paid before Eid prayer.</li>
        </ul>
      </section>

      <!-- FAQ Section -->
      <section class="zakat-section card faq">
        <h3><i class="fas fa-question-circle"></i> Frequently Asked Questions</h3>
        <div class="faq-list">
          <div class="faq-item">
            <div class="faq-question" (click)="toggleFaq(0)">
              <strong>Q: Do I pay Zakat on jewelry I wear?</strong>
              <i class="fas" [class.fa-chevron-down]="!faqOpen[0]" [class.fa-chevron-up]="faqOpen[0]"></i>
            </div>
            <div class="faq-answer" [class.open]="faqOpen[0]">
              <p><strong>A:</strong> Yes, if it is gold or silver and above the Nisab threshold. Most scholars consider personal jewelry as zakatable wealth.</p>
            </div>
          </div>

          <div class="faq-item">
            <div class="faq-question" (click)="toggleFaq(1)">
              <strong>Q: Can I pay Zakat in advance?</strong>
              <i class="fas" [class.fa-chevron-down]="!faqOpen[1]" [class.fa-chevron-up]="faqOpen[1]"></i>
            </div>
            <div class="faq-answer" [class.open]="faqOpen[1]">
              <p><strong>A:</strong> Yes, but you should keep records and adjust if your wealth changes significantly during the year.</p>
            </div>
          </div>

          <div class="faq-item">
            <div class="faq-question" (click)="toggleFaq(2)">
              <strong>Q: Can I give Zakat to family members?</strong>
              <i class="fas" [class.fa-chevron-down]="!faqOpen[2]" [class.fa-chevron-up]="faqOpen[2]"></i>
            </div>
            <div class="faq-answer" [class.open]="faqOpen[2]">
              <p><strong>A:</strong> Yes, you can give Zakat to eligible family members, except your parents, children, and spouse.</p>
            </div>
          </div>

          <div class="faq-item">
            <div class="faq-question" (click)="toggleFaq(3)">
              <strong>Q: What if I can't calculate my exact Zakat?</strong>
              <i class="fas" [class.fa-chevron-down]="!faqOpen[3]" [class.fa-chevron-up]="faqOpen[3]"></i>
            </div>
            <div class="faq-answer" [class.open]="faqOpen[3]">
              <p><strong>A:</strong> Use our Zakat calculator as a guide, and when in doubt, it's better to err on the side of giving slightly more.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Impact Highlight -->
      <section class="zakat-section card impact-highlight">
        <h3><i class="fas fa-hands-helping"></i> The Impact of Your Zakat</h3>
        <blockquote>"Last year, your Zakat provided food and shelter to over 2,000 families in need."</blockquote>
        <img src="assets/images/aboutus/impact1.jpg" alt="Zakat Impact">
        <div class="impact-stats">
          <div class="stat">
            <div class="stat-number">2,000+</div>
            <div class="stat-label">Families Helped</div>
          </div>
          <div class="stat">
            <div class="stat-number">$500K</div>
            <div class="stat-label">Zakat Distributed</div>
          </div>
          <div class="stat">
            <div class="stat-number">15</div>
            <div class="stat-label">Countries Reached</div>
          </div>
        </div>
      </section>

      <!-- Call to Action -->
      <section class="zakat-section cta-section">
        <h3>Ready to Calculate Your Zakat?</h3>
        <p>Use our comprehensive calculator to determine your Zakat obligation and make a difference today.</p>
        <div class="cta-buttons">
          <a routerLink="/zakat-calculator" class="cta-button primary">
            <i class="fas fa-calculator"></i> Calculate Zakat
          </a>
          <a routerLink="/donate" class="cta-button secondary">
            <i class="fas fa-heart"></i> Donate Now
          </a>
        </div>
      </section>

      <!-- External Resources -->
      <div class="external-resources">
        <p>For more detailed information, visit 
          <a href="https://www.islamic-relief.org/zakat/" target="_blank" rel="noopener">
            Islamic Relief's Zakat Guide <i class="fas fa-external-link-alt"></i>
          </a>
        </p>
      </div>
    </section>
  `,
  styleUrls: ['./zakat-education.component.scss']
})
export class ZakatEducationComponent {
  faqOpen: boolean[] = [false, false, false, false];

  toggleFaq(index: number) {
    this.faqOpen[index] = !this.faqOpen[index];
  }
}
