const DonationPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">Donation Policy</h1>
            <p className="text-xl text-gray-600">
              MyZakat – Zakat Distribution Foundation
            </p>
            <p className="text-sm text-gray-500 mt-2">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="card space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-600 leading-relaxed">
                MyZakat – Zakat Distribution Foundation is committed to transparency and accountability in all donation 
                processes. This Donation Policy outlines our practices regarding the acceptance, processing, and distribution 
                of donations to ensure donors understand how their contributions are used.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Types of Donations</h2>
              <div className="text-gray-600 leading-relaxed space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Zakat</h3>
                  <p>
                    Zakat is an obligatory form of charity in Islam. We facilitate the proper calculation and distribution 
                    of Zakat according to Islamic guidelines to eligible recipients, including the poor, needy, and other 
                    categories specified in Islamic law.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Sadaqa</h3>
                  <p>
                    Sadaqa refers to voluntary charitable giving. We accept Sadaqa donations and distribute them to various 
                    causes, including emergency relief, education support, orphan care, and other humanitarian programs.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">General Donations</h3>
                  <p>
                    We accept general donations that support our overall mission and programs. Donors may specify a particular 
                    cause or program, or allow us to allocate funds where they are most needed.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Donation Processing</h2>
              <div className="text-gray-600 leading-relaxed space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Payment Methods</h3>
                  <p>We accept donations through various secure payment methods, including:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
                    <li>Credit and debit cards</li>
                    <li>Bank transfers</li>
                    <li>Online payment processors</li>
                    <li>Recurring monthly donations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Security</h3>
                  <p>
                    All financial transactions are processed through secure, encrypted channels. We do not store complete 
                    credit card information on our servers. Payment processing is handled by trusted third-party payment 
                    processors that comply with industry security standards.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Receipts and Documentation</h3>
                  <p>
                    All donors receive an electronic receipt via email immediately after their donation is processed. 
                    For tax purposes, we provide appropriate documentation for eligible donations. Please retain your 
                    receipts for tax filing purposes.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Use of Donations</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                MyZakat – Zakat Distribution Foundation is committed to using donations efficiently and effectively. 
                Donations are used for:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                <li>Direct assistance to beneficiaries (food, shelter, healthcare, education)</li>
                <li>Emergency relief and disaster response</li>
                <li>Orphan care and support programs</li>
                <li>Educational scholarships and infrastructure</li>
                <li>Operational costs necessary to maintain our programs and services</li>
              </ul>
              <p className="text-gray-600 leading-relaxed mt-4">
                We maintain transparency in our financial operations and provide regular reports on how donations are used. 
                Administrative costs are kept to a minimum, and the majority of funds go directly to program services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Designated Donations</h2>
              <p className="text-gray-600 leading-relaxed">
                When donors specify a particular cause or program, we make every effort to honor those designations. 
                However, if a designated program is fully funded or no longer operational, we may redirect funds to 
                similar programs or where they are most needed, after attempting to contact the donor.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Refund Policy</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Donations are generally considered final and non-refundable. However, we understand that errors may occur. 
                Refund requests will be considered in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                <li>Accidental duplicate donations</li>
                <li>Processing errors</li>
                <li>Unauthorized transactions</li>
                <li>Special circumstances at our discretion</li>
              </ul>
              <p className="text-gray-600 leading-relaxed mt-4">
                Refund requests must be submitted within 30 days of the donation date. Please contact us at 
                info@myzakat.org with your donation receipt and reason for the refund request.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Recurring Donations</h2>
              <p className="text-gray-600 leading-relaxed">
                Donors may set up recurring monthly donations. You can modify or cancel your recurring donation at any time 
                through your account dashboard or by contacting us. Changes will take effect before the next scheduled 
                donation date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Tax Deductibility</h2>
              <p className="text-gray-600 leading-relaxed">
                MyZakat – Zakat Distribution Foundation is a registered charitable organization. Donations may be tax-deductible 
                depending on your jurisdiction and tax laws. We provide receipts for all donations, which can be used for tax 
                purposes. Please consult with a tax professional regarding the deductibility of your donations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Transparency and Reporting</h2>
              <p className="text-gray-600 leading-relaxed">
                We are committed to transparency and accountability. We publish annual reports detailing our financial 
                activities, program impact, and use of donations. Donors can access these reports on our website or request 
                copies by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Privacy of Donors</h2>
              <p className="text-gray-600 leading-relaxed">
                We respect the privacy of our donors. Donor information is kept confidential and is used only for donation 
                processing, communication, and reporting purposes as outlined in our Privacy Policy. We do not sell or share 
                donor information with third parties except as necessary for processing donations or as required by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Contact Us</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                If you have any questions about our Donation Policy or need assistance with a donation, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700"><strong>MyZakat – Zakat Distribution Foundation</strong></p>
                <p className="text-gray-600">Email: info@myzakat.org</p>
                <p className="text-gray-600">Phone: +540-676-0330</p>
                <p className="text-gray-600">Address: 544 Monticello Street, Winchester, VA 22601</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DonationPolicy

