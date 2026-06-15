import SEOHead from '../components/SEOHead'

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SEOHead
        title="Privacy Policy"
        description="MyZakat Privacy Policy. Learn how we collect, use, and protect your personal information when you use our Zakat donation platform."
        canonicalPath="/privacy-policy"
      />
      <div className="section-container">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">Privacy Policy</h1>
            <p className="text-xl text-gray-600">
              MyZakat – Zakat Distribution Foundation
            </p>
            <p className="text-sm text-gray-500 mt-2">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="card space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-600 leading-relaxed">
                MyZakat – Zakat Distribution Foundation ("we," "our," or "us") is committed to protecting your privacy. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit 
                our website and use our services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
              <div className="text-gray-600 leading-relaxed space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Personal Information</h3>
                  <p>We may collect personal information that you voluntarily provide to us, including:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
                    <li>Name and contact information (email address, phone number, mailing address)</li>
                    <li>Payment information (processed securely through third-party payment processors)</li>
                    <li>Account credentials and profile information</li>
                    <li>Donation history and preferences</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Automatically Collected Information</h3>
                  <p>When you visit our website, we may automatically collect certain information, including:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
                    <li>IP address and browser type</li>
                    <li>Device information and operating system</li>
                    <li>Pages visited and time spent on our website</li>
                    <li>Referring website addresses</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                <li>Process and manage your donations</li>
                <li>Send you donation receipts and tax documents</li>
                <li>Communicate with you about our programs and impact</li>
                <li>Respond to your inquiries and provide customer support</li>
                <li>Improve our website and services</li>
                <li>Comply with legal obligations</li>
                <li>Prevent fraud and ensure security</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Information Sharing and Disclosure</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                <li><strong>Service Providers:</strong> We may share information with trusted third-party service providers who assist us in operating our website and conducting our operations (e.g., payment processors, email service providers)</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid legal requests</li>
                <li><strong>Protection of Rights:</strong> We may share information to protect our rights, property, or safety, or that of our users</li>
                <li><strong>With Your Consent:</strong> We may share information with your explicit consent</li>
              </ul>
              <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-gray-800 leading-relaxed">
                  <strong>No Sharing of Mobile / SMS Opt-In Data:</strong> No mobile information,
                  phone numbers, or SMS opt-in consent will be shared with third parties or
                  affiliates for marketing or promotional purposes. Information collected from
                  you as part of SMS / text-messaging consent (including your phone number and
                  the fact that you opted in) is used solely to deliver the messages you have
                  agreed to receive and is not sold, rented, or shared with any third party for
                  marketing. This exclusion applies to all of the sharing categories listed
                  above.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. SMS / Text Messaging Communications</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                If you opt in to receive text (SMS) messages from MyZakat, the following terms apply:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                <li>
                  <strong>Program description:</strong> By opting in you agree to receive
                  recurring transactional and informational text messages from MyZakat —
                  including donation receipts, campaign updates, urgent-need appeals, and
                  event reminders.
                </li>
                <li>
                  <strong>Opt-in required:</strong> You will only receive text messages from us
                  after you have explicitly opted in by submitting your mobile number through
                  our SMS opt-in form or by texting our published keyword to our number. We
                  never add a phone number to our SMS list without that explicit consent.
                </li>
                <li>
                  <strong>Message frequency:</strong> Message frequency varies depending on the
                  type of communication you have opted in to (typically up to 4 messages per
                  month).
                </li>
                <li>
                  <strong>Message and data rates:</strong> Message and data rates may apply
                  depending on your wireless carrier and plan. MyZakat does not charge for the
                  messages themselves.
                </li>
                <li>
                  <strong>HELP and STOP:</strong> You can reply <strong>HELP</strong> at any time
                  for help, or <strong>STOP</strong> at any time to unsubscribe and stop receiving
                  text messages from us. After sending STOP, you will receive one final
                  confirmation message and will not be texted again unless you re-subscribe.
                </li>
                <li>
                  <strong>Supported carriers:</strong> Carriers (including but not limited to
                  AT&amp;T, T-Mobile, Verizon, US Cellular) are not liable for delayed or
                  undelivered messages.
                </li>
                <li>
                  <strong>Data confidentiality:</strong> As stated in Section 4, your mobile
                  phone number and SMS opt-in consent will <strong>not</strong> be shared with
                  any third party or affiliate for marketing purposes under any circumstances.
                </li>
              </ul>
              <p className="text-gray-600 leading-relaxed mt-4">
                For questions about our SMS program, email <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a> or
                call 1-833-MYZAKAT.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Opt-In and Opt-Out</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                You are in full control of the communications you receive from MyZakat.
                This section describes exactly how to opt in and how to opt out of each
                channel.
              </p>

              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">SMS / Text Messages — Opt-In</h3>
                  <p className="text-gray-600 leading-relaxed mb-2">
                    You can opt in to receive text messages from MyZakat in either of the
                    following ways. We will never add your phone number to our SMS list
                    without one of these explicit, affirmative actions:
                  </p>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                    <li>
                      Submitting your mobile number through our SMS opt-in form on the
                      MyZakat website and <strong>checking the consent box</strong> that
                      explicitly states you agree to receive recurring text messages from
                      MyZakat.
                    </li>
                    <li>
                      Texting the keyword <strong>START</strong> to our SMS number, which
                      constitutes your written consent to receive messages.
                    </li>
                  </ul>
                  <p className="text-gray-600 leading-relaxed mt-2">
                    Your consent is not required as a condition of purchasing any goods or
                    services, or of making a donation.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">SMS / Text Messages — Opt-Out</h3>
                  <p className="text-gray-600 leading-relaxed mb-2">
                    You may opt out of MyZakat text messages at any time, free of charge,
                    using any of the following methods:
                  </p>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                    <li>
                      Reply <strong>STOP</strong> to any text message you receive from us.
                      You will receive one final confirmation message acknowledging your
                      opt-out, and you will not receive any further texts from us unless
                      you re-subscribe by texting <strong>START</strong> again.
                    </li>
                    <li>
                      Email <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a> with
                      the subject line "Unsubscribe SMS" and the mobile number you wish to
                      remove.
                    </li>
                    <li>
                      Call us at <a href="tel:+18336992528" className="text-primary-600 hover:underline">1-833-MYZAKAT</a> and
                      ask to be removed from our SMS list.
                    </li>
                  </ul>
                  <p className="text-gray-600 leading-relaxed mt-2">
                    Opting out of SMS does not opt you out of other channels (such as
                    email or postal mail). To re-subscribe at a later date, simply repeat
                    the opt-in process above.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Email — Opt-In and Opt-Out</h3>
                  <p className="text-gray-600 leading-relaxed">
                    You opt in to email communications by providing your email address
                    through one of our forms (donation, newsletter signup, contact, or
                    account registration). You can opt out at any time by clicking the
                    <strong> "Unsubscribe"</strong> link at the bottom of any marketing
                    email we send you, or by emailing <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a>.
                    Transactional emails (donation receipts, account security notices) are
                    sent regardless of marketing-email preferences.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Cookies and Tracking — Opt-Out</h3>
                  <p className="text-gray-600 leading-relaxed">
                    You can disable non-essential cookies through your browser settings.
                    Disabling cookies may affect some functionality of our website but
                    will not prevent you from making donations or contacting us.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Security</h2>
              <p className="text-gray-600 leading-relaxed">
                We implement appropriate technical and organizational security measures to protect your personal information 
                against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over 
                the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Your Rights</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Depending on your location, you may have certain rights regarding your personal information, including:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                <li>The right to access your personal information</li>
                <li>The right to correct inaccurate information</li>
                <li>The right to request deletion of your information</li>
                <li>The right to object to processing of your information</li>
                <li>The right to data portability</li>
                <li>The right to withdraw consent</li>
              </ul>
              <p className="text-gray-600 leading-relaxed mt-4">
                To exercise these rights, please contact us using the information provided in the "Contact Us" section below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Cookies and Tracking Technologies</h2>
              <p className="text-gray-600 leading-relaxed">
                We use cookies and similar tracking technologies to enhance your experience on our website. You can control 
                cookie preferences through your browser settings. However, disabling cookies may limit some functionality of our website.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Children's Privacy</h2>
              <p className="text-gray-600 leading-relaxed">
                Our services are not directed to individuals under the age of 18. We do not knowingly collect personal 
                information from children. If you believe we have collected information from a child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
              <p className="text-gray-600 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
                Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy 
                Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Contact Us</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700"><strong>MyZakat – Zakat Distribution Foundation</strong></p>
                <p className="text-gray-600">Email: info@myzakat.org</p>
                <p className="text-gray-600">Phone: 1-833-MYZAKAT</p>
                <p className="text-gray-600">Address: P.O. BOX 2250, Winchester, VA 22604</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy

