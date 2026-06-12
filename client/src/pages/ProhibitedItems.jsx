import React, { useState } from 'react'
import { Search, AlertTriangle, CheckCircle, ChevronDown, Flame, BatteryWarning, FlaskConical, Gem, Ban, Info } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { prohibitedApi } from '../api'
import { SEO } from '../components/SEO'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'
import { Reveal } from '../components/motion'

export const ProhibitedItems = () => {
  const { t } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState(null)

  const categories = [
    { name: 'Dangerous Goods', icon: Flame, items: ['Explosives', 'Flammable liquids', 'Compressed gases', 'Toxic substances', 'Corrosive materials', 'Radioactive materials'] },
    { name: 'Electronics & Batteries', icon: BatteryWarning, items: ['Lithium batteries (large quantities)', 'Hoverboards', 'Electronic cigarettes', 'Power banks (over 100Wh)'] },
    { name: 'Liquids & Chemicals', icon: FlaskConical, items: ['Perfume/Cologne (large quantities)', 'Paint & solvents', 'Pesticides', 'Acids & alkalis', 'Alcohol (spirits)'] },
    { name: 'Valuable Items', icon: Gem, items: ['Jewelry (high value)', 'Precious metals', 'Diamonds', 'Currency & documents'] },
    { name: 'Other Restrictions', icon: Ban, items: ['Weapons & ammunition', 'Counterfeit goods', 'Obscene materials', 'Protected wildlife', 'Cultural artifacts'] },
  ]

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchTerm.trim()) { toast.error('Please enter an item to search'); return }
    try {
      setSearching(true)
      const response = await prohibitedApi.checkItem(searchTerm)
      setSearchResult(response.data)
    } catch (err) {
      setSearchResult({ allowed: false, reason: err.response?.data?.reason || 'Item not found in database' })
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="relative overflow-hidden py-14 px-4">
      <SEO title="Prohibited Items"
        description="Check which items are prohibited or restricted when shipping from the UK to Kenya with Thapsus Cargo. Stay compliant with customs regulations." />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-4xl mx-auto relative">
        {/* Header */}
        <Reveal className="text-center mb-12 space-y-5">
          <div className="flex justify-center"><PillLabel>Compliance</PillLabel></div>
          <div className="flex justify-center">
            <span className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 grid place-items-center">
              <AlertTriangle className="text-red-400" size={40} />
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">{t('prohibited.title') || 'Prohibited items'}</h1>
          <p className="text-mute text-lg">Check if your items are allowed before shipping.</p>
        </Reveal>

        {/* Quick check */}
        <Reveal className="glow-card p-6 md:p-8 mb-12">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Search className="text-ember-400" size={22} /> Quick check
          </h2>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('prohibited.search') || 'Search an item…'} className="form-input pl-11" />
            </div>
            <button type="submit" disabled={searching} className="btn-primary glass-sheen w-full btn-lg">
              {searching ? 'Searching…' : 'Check item'}
            </button>
          </form>

          {searchResult && (
            <div className={`mt-6 p-5 rounded-2xl border flex items-start gap-4 animate-scale-in ${
              searchResult.allowed ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
              <span className={`p-2 rounded-full shrink-0 ${searchResult.allowed ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                {searchResult.allowed ? <CheckCircle className="text-emerald-400" size={22} /> : <AlertTriangle className="text-red-400" size={22} />}
              </span>
              <div>
                <h3 className={`font-bold text-lg mb-1 ${searchResult.allowed ? 'text-emerald-300' : 'text-red-300'}`}>
                  {searchResult.allowed ? (t('prohibited.allowed') || 'Allowed') : (t('prohibited.restricted') || 'Restricted')}
                </h3>
                {searchResult.reason && <p className={`text-sm ${searchResult.allowed ? 'text-emerald-200/90' : 'text-red-200/90'}`}>{searchResult.reason}</p>}
              </div>
            </div>
          )}
        </Reveal>

        {/* Categories */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">{t('prohibited.categories') || 'Restricted categories'}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {categories.map((category) => {
              const open = expandedCategory === category.name
              const Icon = category.icon
              return (
                <div key={category.name} className={`rounded-2xl border bg-surface transition-colors ${open ? 'border-ember-500/30' : 'border-line'}`}>
                  <button onClick={() => setExpandedCategory(open ? null : category.name)}
                    className="w-full flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      <span className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-line grid place-items-center text-ember-400"><Icon size={22} /></span>
                      <h3 className="text-base font-bold text-white text-left">{category.name}</h3>
                    </div>
                    <ChevronDown size={20} className={`text-mute transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      <ul className="p-5 pt-0 space-y-2.5 border-t border-line mt-1">
                        {category.items.map((item) => (
                          <li key={item} className="flex items-start gap-3">
                            <span className="text-red-400 leading-none mt-1">•</span>
                            <span className="text-white/75 text-sm">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Notice */}
        <div className="alert-info">
          <Info className="shrink-0 mt-0.5 text-blue-300" size={22} />
          <div>
            <h3 className="font-bold text-white mb-1.5">Important notice</h3>
            <p className="text-blue-100/80 text-sm leading-relaxed">
              This list is not exhaustive. Kenya's customs authority reserves the right to prohibit additional items at their discretion. <strong className="text-white">Always declare the full contents of your package.</strong> Undeclared or misrepresented items may result in seizure or legal action. Contact support for specific items not listed here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
