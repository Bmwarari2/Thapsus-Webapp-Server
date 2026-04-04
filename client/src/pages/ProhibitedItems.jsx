import React, { useState } from 'react'
import { Search, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { prohibitedApi } from '../api'
import toast from 'react-hot-toast'

export const ProhibitedItems = () => {
  const { t } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState(null)

  const categories = [
    {
      name: 'Dangerous Goods',
      icon: '⚠️',
      items: [
        'Explosives',
        'Flammable liquids',
        'Compressed gases',
        'Toxic substances',
        'Corrosive materials',
        'Radioactive materials',
      ],
    },
    {
      name: 'Electronics & Batteries',
      icon: '🔌',
      items: [
        'Lithium batteries (large quantities)',
        'Hoverboards',
        'Electronic cigarettes',
        'Power banks (over 100Wh)',
      ],
    },
    {
      name: 'Liquids & Chemicals',
      icon: '🧪',
      items: [
        'Perfume/Cologne (large quantities)',
        'Paint & solvents',
        'Pesticides',
        'Acids & alkalis',
        'Alcohol (spirits)',
      ],
    },
    {
      name: 'Valuable Items',
      icon: '💎',
      items: [
        'Jewelry (high value)',
        'Precious metals',
        'Diamonds',
        'Currency & documents',
      ],
    },
    {
      name: 'Other Restrictions',
      icon: '🚫',
      items: [
        'Weapons & ammunition',
        'Counterfeit goods',
        'Obscene materials',
        'Protected wildlife',
        'Cultural artifacts',
      ],
    },
  ]

  const handleSearch = async (e) => {
    e.preventDefault()

    if (!searchTerm.trim()) {
      toast.error('Please enter an item to search')
      return
    }

    try {
      setSearching(true)
      const response = await prohibitedApi.checkItem(searchTerm)
      setSearchResult(response.data)
    } catch (err) {
      setSearchResult({
        allowed: false,
        reason: err.response?.data?.reason || 'Item not found in database',
      })
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('prohibited.title')}
          </h1>
          <p className="text-gray-600">
            Check if your items are allowed before shipping
          </p>
        </div>

        {/* Search Box */}
        <div className="card mb-8">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-3 text-gray-400" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('prohibited.search')}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Search Result */}
          {searchResult && (
            <div className={`mt-6 p-6 rounded-lg flex items-start gap-4 ${
              searchResult.allowed
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              {searchResult.allowed ? (
                <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={24} />
              ) : (
                <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={24} />
              )}
              <div>
                <h3 className={`font-bold text-lg ${
                  searchResult.allowed ? 'text-green-900' : 'text-red-900'
                }`}>
                  {searchResult.allowed ? t('prohibited.allowed') : t('prohibited.restricted')}
                </h3>
                {searchResult.reason && (
                  <p className={`mt-2 ${
                    searchResult.allowed ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {searchResult.reason}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Categories */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
            {t('prohibited.categories')}
          </h2>

          <div className="space-y-4">
            {categories.map((category) => (
              <div key={category.name} className="card">
                <button
                  onClick={() => setExpandedCategory(
                    expandedCategory === category.name ? null : category.name
                  )}
                  className="w-full flex items-center justify-between hover:bg-gray-50 p-2 rounded transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{category.icon}</span>
                    <h3 className="text-lg font-bold text-[#1e3a5f]">
                      {category.name}
                    </h3>
                  </div>
                  <ChevronDown
                    size={24}
                    className={`text-gray-600 transition-transform ${
                      expandedCategory === category.name ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {expandedCategory === category.name && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {category.items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="text-red-600 font-bold mt-0.5">•</span>
                          <span className="text-gray-700">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Info Card */}
        <div className="card mt-8 bg-blue-50 border border-blue-200">
          <div className="flex gap-4">
            <AlertTriangle className="text-blue-600 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="font-bold text-blue-900 mb-2">Important Notice</h3>
              <p className="text-blue-700 text-sm leading-relaxed">
                This list is not exhaustive. Kenya's customs authority reserves the right to prohibit additional items at their discretion. Always declare the full contents of your package. Undeclared or misrepresented items may result in package seizure or legal action. Contact us for specific items not listed here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
