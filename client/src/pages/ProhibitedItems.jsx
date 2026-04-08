import React, { useState } from 'react'
import { Search, AlertTriangle, CheckCircle, ChevronDown, Package } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { prohibitedApi } from '../api'
import { SEO } from '../components/SEO'
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
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      <SEO
        title="Prohibited Items"
        description="Check which items are prohibited or restricted when shipping from the UK and China to Kenya with Thapsus Cargo. Stay compliant with customs regulations."
      />
      {/* Liquid Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-indigo-200/20 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header - Refined Typography */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-white/40 backdrop-blur-2xl border border-white/60 shadow-xl rounded-full flex items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-red-400/10 blur-xl rounded-full" />
               <AlertTriangle className="text-red-500 relative z-10 drop-shadow-sm" size={40} />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-4 leading-none tracking-tighter">
            {t('prohibited.title')}
          </h1>
          <p className="text-slate-600 font-medium text-lg">
            Check if your items are allowed before shipping
          </p>
        </div>

        {/* Search Box - Crystal Borders & Interactive Element */}
        <div className="group relative overflow-hidden bg-[#0f172a]/90 backdrop-blur-2xl border border-white/10 rounded-[24px] p-6 md:p-8 text-white shadow-2xl mb-12 transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
          {/* Blurred Orange Orb inside Dark Glass */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-500/30 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            <h2 className="text-xl font-black tracking-tighter leading-none mb-4 flex items-center gap-2">
              <Search className="text-orange-400" size={24} />
              Quick Check
            </h2>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-4 text-slate-400" size={20} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('prohibited.search')}
                  className="w-full pl-12 pr-4 py-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-white font-semibold transition-all placeholder-slate-500 shadow-inner"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="group/btn relative overflow-hidden w-full bg-orange-500 hover:bg-orange-400 text-slate-900 py-4 rounded-xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen disabled:opacity-50"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                <span className="relative z-10">{searching ? 'Searching...' : 'Check Item'}</span>
              </button>
            </form>

            {/* Search Result */}
            {searchResult && (
              <div className={`mt-6 p-6 rounded-xl border backdrop-blur-md transition-all duration-300 animate-fade-in flex items-start gap-4 ${
                searchResult.allowed
                  ? 'bg-gradient-to-br from-green-500/20 to-emerald-600/10 border-green-500/30'
                  : 'bg-gradient-to-br from-red-500/20 to-rose-600/10 border-red-500/30'
              }`}>
                {searchResult.allowed ? (
                  <div className="p-2 bg-green-500/20 rounded-full shrink-0">
                    <CheckCircle className="text-green-400" size={24} />
                  </div>
                ) : (
                  <div className="p-2 bg-red-500/20 rounded-full shrink-0">
                    <AlertTriangle className="text-red-400" size={24} />
                  </div>
                )}
                <div>
                  <h3 className={`font-black text-xl tracking-tight leading-none mb-2 ${
                    searchResult.allowed ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {searchResult.allowed ? t('prohibited.allowed') : t('prohibited.restricted')}
                  </h3>
                  {searchResult.reason && (
                    <p className={`text-sm font-medium ${
                      searchResult.allowed ? 'text-green-100' : 'text-red-100'
                    }`}>
                      {searchResult.reason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Categories - Crystal Borders */}
        <div className="mb-12">
          <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-6">
            {t('prohibited.categories')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((category) => (
              <div key={category.name} className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl relative overflow-hidden glass-sheen">
                <button
                  onClick={() => setExpandedCategory(
                    expandedCategory === category.name ? null : category.name
                  )}
                  className="w-full flex items-center justify-between p-5 hover:bg-white/50 transition-colors relative z-10"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/60 rounded-full flex items-center justify-center text-2xl shadow-sm border border-white/80">
                      {category.icon}
                    </div>
                    <h3 className="text-lg font-black text-[#1e3a5f] tracking-tight">
                      {category.name}
                    </h3>
                  </div>
                  <ChevronDown
                    size={20}
                    className={`text-slate-500 transition-transform duration-300 ${
                      expandedCategory === category.name ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <div className={`overflow-hidden transition-all duration-300 relative z-10 ${expandedCategory === category.name ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="p-5 pt-0 border-t border-white/40 bg-white/30 backdrop-blur-sm">
                    <ul className="space-y-3 mt-4">
                      {category.items.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <span className="text-red-500 font-black text-lg leading-none mt-0.5">•</span>
                          <span className="text-slate-700 font-semibold text-sm">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Card - Border Gradient (Step 4 style) */}
        <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 shadow-xl transform transition-transform hover:scale-[1.01] duration-500">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[23px] p-8 md:p-10 relative overflow-hidden glass-sheen">
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />
            
            <div className="flex flex-col md:flex-row gap-6 relative z-10">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border border-blue-200">
                <AlertTriangle className="text-blue-600" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-blue-900 tracking-tighter leading-none mb-3">Important Notice</h3>
                <p className="text-blue-800/80 font-medium leading-relaxed">
                  This list is not exhaustive. Kenya's customs authority reserves the right to prohibit additional items at their discretion. <strong className="text-blue-900 font-black">Always declare the full contents of your package.</strong> Undeclared or misrepresented items may result in package seizure or legal action. Contact our support team for specific items not listed here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
