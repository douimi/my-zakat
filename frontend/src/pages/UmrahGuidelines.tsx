import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const STEPS = [
  { step: 1, title: 'Ihram', description: 'Enter the state of Ihram at the designated Miqat point before reaching Makkah' },
  { step: 2, title: 'Tawaf', description: 'Perform seven circuits around the Kaaba, starting and ending at the Black Stone' },
  { step: 3, title: 'Sa\'i', description: 'Walk seven times between Safa and Marwah hills' },
  { step: 4, title: 'Halq or Taqsir', description: 'Shave head (Halq) or trim hair (Taqsir) to complete Umrah' },
]

const REMINDERS = [
  'Umrah can be performed at any time of the year',
  'Ensure you have valid travel documents and visas',
  'Follow all health and safety guidelines',
  'Respect the sanctity of the holy sites',
  'Consult with knowledgeable guides or scholars for detailed procedures',
]

const UmrahGuidelines = () => {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Umrah Guidelines"
        description="Complete Umrah guidelines and step-by-step instructions. Learn the rituals, preparations, and duas for performing Umrah pilgrimage."
        canonicalPath="/umrah-guidelines"
      />
      <PageHeader title="Umrah Guidelines" description="The four steps of the lesser pilgrimage to Makkah." />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl space-y-8">
          <ol className="space-y-4">
            {STEPS.map((item) => (
              <li key={item.step} className="flex items-start gap-4">
                <span
                  className="w-9 h-9 bg-primary-50 text-primary-700 rounded-full flex items-center justify-center font-semibold shrink-0"
                  aria-hidden="true"
                >
                  {item.step}
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">{item.title}</h2>
                  <p className="text-gray-700">{item.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="alert-info block" aria-labelledby="umrah-reminders">
            <h2 id="umrah-reminders" className="font-semibold mb-2">Important Reminders</h2>
            <ul className="list-disc pl-5 space-y-1">
              {REMINDERS.map((reminder) => (
                <li key={reminder}>{reminder}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export default UmrahGuidelines
