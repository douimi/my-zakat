import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

interface ZakatData {
  liabilities: number;
  cash: number;
  receivables: number;
  stocks: number;
  retirement: number;
  gold_weight: number;
  gold_price_per_gram: number;
  silver_weight: number;
  silver_price_per_gram: number;
  business_goods: number;
  agriculture_value: number;
  investment_property: number;
  other_valuables: number;
  livestock: number;
  other_assets: number;
}

interface ZakatResults {
  wealth: number;
  gold: number;
  silver: number;
  business_goods: number;
  agriculture: number;
  total_eligible_wealth: number;
  total: number;
}

@Component({
  selector: 'app-zakat-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="zakat-calculator-section">
      <div class="zakat-title-area">
        <h2><i class="fas fa-balance-scale" style="color:#28a745;"></i> Zakat Calculator</h2>
        <p class="zakat-subtitle">Easily estimate your annual Zakat in a few simple steps.</p>
      </div>
      
      <p class="zakat-intro-text">
        <i class="fas fa-info-circle" style="color:#007bff;"></i> 
        Use this calculator to estimate your Zakat obligation. Enter the value for each asset you own—no need to fill every field. The calculator will sum your zakatable assets automatically.
      </p>

      <!-- Results Section -->
      <div *ngIf="zakatResults" class="zakat-results-card">
        <h3 style="color:#28a745;"><i class="fas fa-check-circle"></i> Zakat Calculation Results</h3>
        <table class="zakat-results-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Zakat Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Zakat on Wealth</td>
              <td>\${{zakatResults.wealth | number:'1.2-2'}}</td>
            </tr>
            <tr>
              <td>Zakat on Gold</td>
              <td>\${{zakatResults.gold | number:'1.2-2'}}</td>
            </tr>
            <tr>
              <td>Zakat on Silver</td>
              <td>\${{zakatResults.silver | number:'1.2-2'}}</td>
            </tr>
            <tr>
              <td>Zakat on Business Goods</td>
              <td>\${{zakatResults.business_goods | number:'1.2-2'}}</td>
            </tr>
            <tr>
              <td>Zakat on Agricultural Produce</td>
              <td>\${{zakatResults.agriculture | number:'1.2-2'}}</td>
            </tr>
            <tr>
              <td>Total Zakat-Eligible Wealth</td>
              <td>\${{zakatResults.total_eligible_wealth | number:'1.2-2'}}</td>
            </tr>
            <tr class="total-row">
              <th>Total Zakat Due</th>
              <th style="color:#218838;font-size:1.2em;">\${{zakatResults.total | number:'1.2-2'}}</th>
            </tr>
          </tbody>
        </table>
        
        <div class="donate-section">
          <p>Would you like to donate your Zakat?</p>
          <a [routerLink]="['/donate']" 
             [queryParams]="{amount: zakatResults.total}" 
             class="donate-button">
            <i class="fas fa-donate"></i> Donate \${{zakatResults.total | number:'1.2-2'}}
          </a>
        </div>
      </div>

      <!-- Calculator Form -->
      <form (ngSubmit)="calculateZakat()" class="zakat-form zakat-form-card zakat-form-large" #zakatForm="ngForm">
        
        <!-- Liabilities Section -->
        <fieldset>
          <legend>
            Liabilities 
            <span class="info-tooltip" title="Debts or obligations due within the year. These are subtracted from your zakatable assets.">
              <i class="fas fa-info-circle"></i>
            </span>
          </legend>
          <div class="form-row">
            <div class="form-group">
              <label for="liabilities">
                <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Liabilities
                <span class="tooltip" title="Debts and obligations due within the year.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="liabilities" 
                name="liabilities" 
                [(ngModel)]="zakatData.liabilities"
                step="0.01" 
                placeholder="Enter total liabilities">
            </div>
          </div>
        </fieldset>

        <!-- Cash & Receivables Section -->
        <fieldset>
          <legend>
            Cash & Receivables 
            <span class="info-tooltip" title="Include all cash at home, in wallets, and in all bank accounts. Receivables are money owed to you that you expect to receive.">
              <i class="fas fa-info-circle"></i>
            </span>
          </legend>
          <div class="form-row">
            <div class="form-group">
              <label for="cash">
                <i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i> Cash
                <span class="tooltip" title="Cash in hand, bank accounts, wallets, etc.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="cash" 
                name="cash" 
                [(ngModel)]="zakatData.cash"
                step="0.01" 
                placeholder="Enter total cash">
            </div>
            <div class="form-group">
              <label for="receivables">
                <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> Receivables
                <span class="tooltip" title="Money owed to you that you expect to receive.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="receivables" 
                name="receivables" 
                [(ngModel)]="zakatData.receivables"
                step="0.01" 
                placeholder="Enter receivables">
            </div>
          </div>
        </fieldset>

        <!-- Investments Section -->
        <fieldset>
          <legend>
            Investments 
            <span class="info-tooltip" title="Market value of stocks, bonds, mutual funds, and retirement accounts (if zakatable). Exclude non-zakatable pensions.">
              <i class="fas fa-info-circle"></i>
            </span>
          </legend>
          <div class="form-row">
            <div class="form-group">
              <label for="stocks">
                <i class="fa-solid fa-chart-line" aria-hidden="true"></i> Stocks & Investments
                <span class="tooltip" title="Market value of stocks, mutual funds, etc.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="stocks" 
                name="stocks" 
                [(ngModel)]="zakatData.stocks"
                step="0.01" 
                placeholder="Enter total value">
            </div>
            <div class="form-group">
              <label for="retirement">
                <i class="fa-solid fa-piggy-bank" aria-hidden="true"></i> Retirement Accounts
                <span class="tooltip" title="Zakatable portion of retirement funds (401k, IRA, etc.)">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="retirement" 
                name="retirement" 
                [(ngModel)]="zakatData.retirement"
                step="0.01" 
                placeholder="Enter value (if applicable)">
            </div>
          </div>
        </fieldset>

        <!-- Gold & Silver Section -->
        <fieldset>
          <legend>
            Gold & Silver 
            <span class="info-tooltip" title="Enter the weight and current price per gram for gold and silver you own. Personal jewelry is zakatable according to most scholars.">
              <i class="fas fa-info-circle"></i>
            </span>
          </legend>
          <div class="form-row">
            <div class="form-group">
              <label for="gold_weight">
                <i class="fa-solid fa-coins" aria-hidden="true"></i> Gold (grams)
                <span class="tooltip" title="Total weight of gold in grams.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="gold_weight" 
                name="gold_weight" 
                [(ngModel)]="zakatData.gold_weight"
                step="0.01" 
                placeholder="Enter gold weight">
            </div>
            <div class="form-group">
              <label for="gold_price_per_gram">
                <i class="fa-solid fa-dollar-sign" aria-hidden="true"></i> Gold Price/Gram
                <span class="tooltip" title="Current price per gram of gold.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="gold_price_per_gram" 
                name="gold_price_per_gram"
                [(ngModel)]="zakatData.gold_price_per_gram"
                step="0.01" 
                placeholder="Enter gold price per gram">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="silver_weight">
                <i class="fa-solid fa-coins" aria-hidden="true"></i> Silver (grams)
                <span class="tooltip" title="Total weight of silver in grams.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="silver_weight" 
                name="silver_weight" 
                [(ngModel)]="zakatData.silver_weight"
                step="0.01" 
                placeholder="Enter silver weight">
            </div>
            <div class="form-group">
              <label for="silver_price_per_gram">
                <i class="fa-solid fa-dollar-sign" aria-hidden="true"></i> Silver Price/Gram
                <span class="tooltip" title="Current price per gram of silver.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="silver_price_per_gram" 
                name="silver_price_per_gram"
                [(ngModel)]="zakatData.silver_price_per_gram"
                step="0.01" 
                placeholder="Enter silver price per gram">
            </div>
          </div>
        </fieldset>

        <!-- Business & Agriculture Section -->
        <fieldset>
          <legend>
            Business & Agriculture 
            <span class="info-tooltip" title="Value of business inventory, goods for sale, and agricultural produce ready for sale.">
              <i class="fas fa-info-circle"></i>
            </span>
          </legend>
          <div class="form-group">
            <label for="business_goods">
              <i class="fa-solid fa-store" aria-hidden="true"></i> Business Goods
              <span class="tooltip" title="Value of inventory and goods for sale.">
                <i class="fa-solid fa-circle-info"></i>
              </span>
            </label>
            <input 
              type="number" 
              id="business_goods" 
              name="business_goods" 
              [(ngModel)]="zakatData.business_goods"
              step="0.01" 
              placeholder="Enter business goods value">
          </div>
          <div class="form-group">
            <label for="agriculture_value">
              <i class="fa-solid fa-wheat-awn" aria-hidden="true"></i> Agriculture Produce
              <span class="tooltip" title="Market value of crops and produce.">
                <i class="fa-solid fa-circle-info"></i>
              </span>
            </label>
            <input 
              type="number" 
              id="agriculture_value" 
              name="agriculture_value" 
              [(ngModel)]="zakatData.agriculture_value"
              step="0.01" 
              placeholder="Enter agricultural produce value">
          </div>
        </fieldset>

        <!-- Property & Other Assets Section -->
        <fieldset>
          <legend>
            Property & Other Assets 
            <span class="info-tooltip" title="Only include property held for investment or resale, not your personal residence. Include other zakatable valuables and livestock.">
              <i class="fas fa-info-circle"></i>
            </span>
          </legend>
          <div class="form-row">
            <div class="form-group">
              <label for="investment_property">
                <i class="fa-solid fa-building" aria-hidden="true"></i> Investment Property
                <span class="tooltip" title="Value of property held for investment (not personal residence).">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="investment_property" 
                name="investment_property" 
                [(ngModel)]="zakatData.investment_property"
                step="0.01" 
                placeholder="Enter value">
            </div>
            <div class="form-group">
              <label for="other_valuables">
                <i class="fa-solid fa-gem" aria-hidden="true"></i> Other Valuables
                <span class="tooltip" title="Jewelry, collectibles, or other valuable items.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="other_valuables" 
                name="other_valuables" 
                [(ngModel)]="zakatData.other_valuables"
                step="0.01" 
                placeholder="Enter value">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="livestock">
                <i class="fa-solid fa-cow" aria-hidden="true"></i> Livestock
                <span class="tooltip" title="Value of zakatable livestock (cows, sheep, camels, etc.)">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="livestock" 
                name="livestock" 
                [(ngModel)]="zakatData.livestock"
                step="0.01" 
                placeholder="Enter value">
            </div>
            <div class="form-group">
              <label for="other_assets">
                <i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> Other Assets
                <span class="tooltip" title="Any other zakatable assets not listed above.">
                  <i class="fa-solid fa-circle-info"></i>
                </span>
              </label>
              <input 
                type="number" 
                id="other_assets" 
                name="other_assets" 
                [(ngModel)]="zakatData.other_assets"
                step="0.01" 
                placeholder="Enter value">
            </div>
          </div>
        </fieldset>

        <!-- Nisab Display -->
        <div class="nisab-info">
          <strong>Nisab (minimum threshold):</strong> 
          <span id="nisab-value">87.48g gold or 612.36g silver (or their cash equivalent)</span>
          <span class="info-tooltip" title="If your total zakatable assets are below the Nisab, zakat is not obligatory.">
            <i class="fas fa-info-circle"></i>
          </span>
        </div>

        <div class="form-actions">
          <button type="submit" class="calculate-btn">
            <i class="fas fa-calculator"></i> Calculate Zakat
          </button>
          <button type="button" class="reset-btn" (click)="resetForm()">
            <i class="fas fa-undo"></i> Clear
          </button>
        </div>
      </form>
    </section>
  `,
  styleUrls: ['./zakat-calculator.component.scss']
})
export class ZakatCalculatorComponent {
  zakatData: ZakatData = {
    liabilities: 0,
    cash: 0,
    receivables: 0,
    stocks: 0,
    retirement: 0,
    gold_weight: 0,
    gold_price_per_gram: 0,
    silver_weight: 0,
    silver_price_per_gram: 0,
    business_goods: 0,
    agriculture_value: 0,
    investment_property: 0,
    other_valuables: 0,
    livestock: 0,
    other_assets: 0
  };

  zakatResults: ZakatResults | null = null;

  calculateZakat() {
    // Calculate total wealth
    const goldValue = this.zakatData.gold_weight * this.zakatData.gold_price_per_gram;
    const silverValue = this.zakatData.silver_weight * this.zakatData.silver_price_per_gram;
    
    const totalWealth = 
      this.zakatData.cash +
      this.zakatData.receivables +
      this.zakatData.stocks +
      this.zakatData.retirement +
      this.zakatData.investment_property +
      this.zakatData.other_valuables +
      this.zakatData.livestock +
      this.zakatData.other_assets;

    const netWealth = Math.max(0, totalWealth - this.zakatData.liabilities);
    const totalEligibleWealth = netWealth + goldValue + silverValue + this.zakatData.business_goods + this.zakatData.agriculture_value;

    // Calculate zakat (2.5% for most assets, 5% or 10% for agriculture)
    const zakatRate = 0.025; // 2.5%
    const agricultureRate = 0.05; // 5% for irrigated, 10% for rain-fed (simplified to 5%)

    this.zakatResults = {
      wealth: netWealth * zakatRate,
      gold: goldValue * zakatRate,
      silver: silverValue * zakatRate,
      business_goods: this.zakatData.business_goods * zakatRate,
      agriculture: this.zakatData.agriculture_value * agricultureRate,
      total_eligible_wealth: totalEligibleWealth,
      total: (netWealth * zakatRate) + 
             (goldValue * zakatRate) + 
             (silverValue * zakatRate) + 
             (this.zakatData.business_goods * zakatRate) + 
             (this.zakatData.agriculture_value * agricultureRate)
    };

    // Scroll to results
    setTimeout(() => {
      const resultsElement = document.querySelector('.zakat-results-card');
      if (resultsElement) {
        resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  resetForm() {
    this.zakatData = {
      liabilities: 0,
      cash: 0,
      receivables: 0,
      stocks: 0,
      retirement: 0,
      gold_weight: 0,
      gold_price_per_gram: 0,
      silver_weight: 0,
      silver_price_per_gram: 0,
      business_goods: 0,
      agriculture_value: 0,
      investment_property: 0,
      other_valuables: 0,
      livestock: 0,
      other_assets: 0
    };
    this.zakatResults = null;
  }
}
