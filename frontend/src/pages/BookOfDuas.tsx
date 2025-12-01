import { BookOpen } from 'lucide-react'

const BookOfDuas = () => {
  const duas = [
    { title: 'Morning Duas', description: 'Supplications to start your day with blessings' },
    { title: 'Evening Duas', description: 'Duas for protection and peace at night' },
    { title: 'Prayer Duas', description: 'Essential supplications during Salah' },
    { title: 'Daily Life Duas', description: 'Duas for eating, traveling, and daily activities' },
    { title: 'Special Occasions', description: 'Duas for Ramadan, Hajj, and important moments' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="flex items-center mb-8">
            <BookOpen className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-4xl font-heading font-bold text-gray-900">Book of Duas</h1>
          </div>
          
          <p className="text-xl text-gray-600 mb-8">
            A comprehensive collection of authentic supplications from the Quran and Sunnah for every occasion.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {duas.map((dua, index) => (
              <div key={index} className="card hover:shadow-xl transition-shadow">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{dua.title}</h3>
                <p className="text-gray-600">{dua.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookOfDuas

