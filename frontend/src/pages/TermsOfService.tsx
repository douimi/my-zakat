import SEOHead from '../components/SEOHead'

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SEOHead
        title="Terms of Service"
        description="MyZakat Terms of Service. Read the terms governing your use of the MyZakat platform — donations, account use, content, and your rights as a user."
        canonicalPath="/terms-of-service"
      />
      <div className="section-container">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">Terms of Service</h1>
            <p className="text-xl text-gray-600">MyZakat – Zakat Distribution Foundation</p>
            <p className="text-sm text-gray-500 mt-2">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="card space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-600 leading-relaxed">
                By accessing or using the MyZakat website, mobile experience, or any of our services
                (collectively, the "Services"), you agree to be bound by these Terms of Service ("Terms").
                If you do not agree to these Terms, please do not use the Services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. About MyZakat</h2>
              <p className="text-gray-600 leading-relaxed">
                MyZakat – Zakat Distribution Foundation is a nonprofit organization that facilitates
                Zakat, Sadaqa, and other charitable donations, distributing them to eligible recipients
                in accordance with Islamic principles. We provide tools to help donors calculate their
                Zakat, manage their giving, and stay informed about the impact of their contributions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Eligibility</h2>
              <p className="text-gray-600 leading-relaxed">
                You must be at least 18 years old (or the age of majority in your jurisdiction) to make
                a donation or create an account. By using the Services, you represent that you meet these
                requirements and that all information you provide is accurate and current.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Donations</h2>
              <div className="text-gray-600 leading-relaxed space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">4.1 Voluntary Contributions</h3>
                  <p>
                    All donations are voluntary. By submitting a donation, you authorize MyZakat to charge
                    the payment method you provide for the amount specified, including any applicable
                    recurring amounts if you select a monthly or annual donation.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">4.2 Use of Funds</h3>
                  <p>
                    Donations are used to support our charitable programs, with funds allocated to the
                    purpose you select (e.g., Zakat, General Donation, Emergency Relief). MyZakat retains
                    discretion to redirect funds when a designated need has been fully met or when an
                    urgent circumstance requires reallocation, always in accordance with our mission and
                    Islamic charitable guidelines.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">4.3 Refunds</h3>
                  <p>
                    Donations are generally non-refundable. If you believe a donation was made in error,
                    please contact us within 30 days at <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a>
                    {' '}and we will review your request in good faith. See our Donation Policy for full details.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">4.4 Recurring Donations</h3>
                  <p>
                    Recurring donations continue until you cancel them. You can cancel at any time from
                    your user dashboard or by emailing us. Cancellation takes effect for the next billing
                    cycle; charges already processed are not retroactively refunded.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Tax Receipts</h2>
              <p className="text-gray-600 leading-relaxed">
                MyZakat is a registered 501(c)(3) nonprofit organization in the United States. Donations
                may be tax-deductible to the extent permitted by law. We will provide a donation receipt
                via email after each successful contribution. Please consult your tax advisor regarding
                the deductibility of your donation in your jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. User Accounts</h2>
              <p className="text-gray-600 leading-relaxed">
                You may create an account to track your donations and manage recurring contributions.
                You are responsible for safeguarding your password and for any activity under your
                account. Notify us immediately at <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a>
                {' '}if you suspect unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Acceptable Use</h2>
              <div className="text-gray-600 leading-relaxed">
                <p>You agree not to:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
                  <li>Use the Services for any unlawful purpose or in violation of these Terms</li>
                  <li>Submit fraudulent payment information or donations on behalf of someone else without authorization</li>
                  <li>Attempt to gain unauthorized access to any part of the Services or our infrastructure</li>
                  <li>Upload or transmit malicious code, spam, or harmful content</li>
                  <li>Impersonate any person or entity or misrepresent your affiliation with any party</li>
                  <li>Interfere with or disrupt the integrity or performance of the Services</li>
                  <li>Use automated tools (scrapers, bots) to access the Services without our written permission</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Intellectual Property</h2>
              <p className="text-gray-600 leading-relaxed">
                All content on the Services — including text, graphics, logos, images, videos, and
                software — is the property of MyZakat or its licensors and is protected by copyright,
                trademark, and other applicable laws. You may not reproduce, distribute, modify, or
                create derivative works from any of our content without our prior written consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. User-Submitted Content</h2>
              <p className="text-gray-600 leading-relaxed">
                If you submit testimonials, comments, or other content to MyZakat, you grant us a
                worldwide, royalty-free, non-exclusive license to use, reproduce, display, and distribute
                that content in connection with our charitable mission. You represent that you own or
                have the necessary rights to submit such content and that it does not infringe any
                third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Third-Party Services</h2>
              <p className="text-gray-600 leading-relaxed">
                Payment processing is handled by Stripe, Inc. By making a donation, you also agree to
                Stripe's terms and privacy policy. MyZakat does not store your full payment card details
                on our servers. Other third-party services (e.g., email, analytics) may be used to
                operate the Services and have their own terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Disclaimers</h2>
              <p className="text-gray-600 leading-relaxed">
                The Services are provided "as is" and "as available" without warranties of any kind,
                either express or implied. While we strive to keep the Services available and accurate,
                we do not guarantee uninterrupted access or that the Services will be free from errors.
                MyZakat is not responsible for any third-party content or services accessible through
                the Services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Limitation of Liability</h2>
              <p className="text-gray-600 leading-relaxed">
                To the maximum extent permitted by law, MyZakat and its officers, directors, employees,
                and volunteers will not be liable for any indirect, incidental, special, consequential,
                or punitive damages arising from your use of the Services. Our total liability for any
                claim related to the Services shall not exceed the amount you donated in the 12 months
                preceding the event giving rise to the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Indemnification</h2>
              <p className="text-gray-600 leading-relaxed">
                You agree to indemnify and hold harmless MyZakat, its affiliates, and personnel from any
                claims, damages, or expenses arising from your violation of these Terms, your misuse of
                the Services, or your violation of any third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Termination</h2>
              <p className="text-gray-600 leading-relaxed">
                We may suspend or terminate your access to the Services at any time, without notice,
                if we believe you have violated these Terms or engaged in conduct that harms MyZakat or
                other users. You may stop using the Services at any time and request account deletion
                by emailing <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Changes to These Terms</h2>
              <p className="text-gray-600 leading-relaxed">
                We may update these Terms from time to time. When we do, we will revise the "Last updated"
                date at the top of this page. Material changes will be communicated via the Services or
                by email when reasonably possible. Your continued use of the Services after the updated
                Terms take effect constitutes your acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. Governing Law</h2>
              <p className="text-gray-600 leading-relaxed">
                These Terms are governed by the laws of the Commonwealth of Virginia, United States,
                without regard to its conflict-of-laws principles. Any disputes will be resolved in the
                state or federal courts located in Virginia.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">17. Contact Us</h2>
              <div className="text-gray-600 leading-relaxed space-y-2">
                <p>If you have any questions about these Terms, please contact us:</p>
                <p>
                  <strong>MyZakat – Zakat Distribution Foundation</strong><br />
                  544 Monticello Street<br />
                  Winchester, VA 22601<br />
                  Email: <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a><br />
                  Phone: <a href="tel:+15406760330" className="text-primary-600 hover:underline">+1-540-676-0330</a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsOfService
