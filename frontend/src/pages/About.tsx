import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const About = () => {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="About Us"
        description="Learn about MyZakat Zakat Distribution Foundation – our mission, values, and commitment to transparent Zakat and Sadaqa distribution. Empowering communities through charitable giving."
        canonicalPath="/about"
      />

      <PageHeader
        title="About MyZakat"
        description="A zakat foundation based in Winchester, Virginia. We collect zakat and sadaqa and put it to work for people in need."
      />

      <div className="section">
        <div className="section-container">
          <div className="max-w-3xl space-y-12">
            <section aria-labelledby="about-story">
              <h2 id="about-story" className="section-title">Our story</h2>
              <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                MyZakat began as personal giving: individual efforts to meet immediate needs, paid
                for with our own resources. It has grown into a foundation so that others can give
                through it too, and it still works the same way, one specific need at a time.
              </p>
            </section>

            <section aria-labelledby="about-what">
              <h2 id="about-what" className="section-title">What we do</h2>
              <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                We turn zakat and sadaqa into specific help: food, clean water, shelter, schooling
                and support for orphans. Zakat goes only to people who are eligible to receive it.
              </p>
              <p className="mt-4 text-lg text-gray-700">
                See <Link to="/programs" className="link">our programs</Link> and the{' '}
                <Link to="/projects" className="link">projects we are funding</Link>.
              </p>
            </section>

            <section aria-labelledby="about-involved" className="card-tinted">
              <h2 id="about-involved" className="text-2xl font-heading font-bold text-gray-900">Get involved</h2>
              <p className="mt-2 text-gray-700">
                Give, volunteer, or tell someone who should know about us.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to="/donate" className="btn-primary">
                  Make a Donation
                </Link>
                <Link to="/volunteer" className="btn-secondary">
                  Become a Volunteer
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default About
