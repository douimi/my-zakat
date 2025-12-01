import { BookOpen, Heart } from 'lucide-react'

const IslamicKnowledge = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="flex items-center mb-8">
            <BookOpen className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-4xl font-heading font-bold text-gray-900">Islamic Knowledge Base</h1>
          </div>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-xl text-gray-600 mb-6">
              Explore comprehensive Islamic knowledge and guidance to deepen your understanding of faith and practice.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <div className="card">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Foundations of Faith</h3>
                <p className="text-gray-600">
                  Learn about the fundamental principles of Islam, including the Five Pillars, articles of faith, and core beliefs.
                </p>
              </div>
              
              <div className="card">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Worship & Rituals</h3>
                <p className="text-gray-600">
                  Understand the proper methods of prayer, fasting, Hajj, Umrah, and other acts of worship in Islam.
                </p>
              </div>
              
              <div className="card">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Islamic Ethics</h3>
                <p className="text-gray-600">
                  Discover the moral and ethical teachings of Islam, including kindness, justice, and compassion.
                </p>
              </div>
              
              <div className="card">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Quran & Hadith</h3>
                <p className="text-gray-600">
                  Access resources for studying the Quran and authentic Hadith collections with proper context and interpretation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default IslamicKnowledge

