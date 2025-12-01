import { Link } from 'react-router-dom'
import { BookOpen, Calculator, Heart, Info, FileText, Globe, ArrowLeft } from 'lucide-react'

const QuickLinks = () => {
  const islamicLinks = [
    { name: 'Islamic Knowledge Base', href: '/islamic-knowledge', icon: BookOpen },
    { name: 'Book of Duas', href: '/book-of-duas', icon: BookOpen },
    { name: 'Charity in Islam', href: '/charity-in-islam', icon: Heart },
  ]

  const toolsLinks = [
    { name: 'Zakat Calculator', href: '/zakat-calculator', icon: Calculator },
    { name: 'Kaffarah Calculator', href: '/kaffarah-calculator', icon: Calculator },
    { name: 'Ways to Donate', href: '/donate', icon: Heart },
  ]

  const quickLinks = [
    { name: 'Zakat on Gold', href: '/zakat-on-gold', icon: Info },
    { name: 'Umrah Guidelines', href: '/umrah-guidelines', icon: Globe },
  ]

  const LinkColumn = ({ title, links, icon: Icon }: { title: string; links: Array<{ name: string; href: string; icon: any }>; icon: any }) => (
    <div className="flex flex-col">
      <div className="flex items-center mb-6">
        <Icon className="w-6 h-6 text-primary-600 mr-3" />
        <h2 className="text-xl font-bold text-primary-600">{title}</h2>
      </div>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              to={link.href}
              className="text-gray-700 hover:text-primary-600 transition-colors duration-200 flex items-center group"
            >
              <link.icon className="w-4 h-4 mr-2 text-gray-400 group-hover:text-primary-600 transition-colors" />
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center text-gray-600 hover:text-primary-600 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">Quick Links</h1>
          <p className="text-xl text-gray-600">Access important resources and information</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Column 1: Islamic */}
            <div className="border-r-0 md:border-r border-gray-200 pr-0 md:pr-8">
              <LinkColumn title="Islamic" links={islamicLinks} icon={BookOpen} />
            </div>

            {/* Column 2: Tools */}
            <div className="border-r-0 md:border-r border-gray-200 pr-0 md:pr-8">
              <LinkColumn title="Tools" links={toolsLinks} icon={Calculator} />
            </div>

            {/* Column 3: Quick Links */}
            <div>
              <LinkColumn title="Quick Links" links={quickLinks} icon={FileText} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuickLinks

