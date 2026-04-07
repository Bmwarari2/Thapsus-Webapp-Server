import React from 'react'
import { MessageCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const SupportChatWidget = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Only show for authenticated users and hide on the dedicated support page
  if (!user || location.pathname === '/support') return null

  const handleOpenSupport = () => {
    navigate('/support')
  }

  return (
    <button
      type="button"
      onClick={handleOpenSupport}
      className="group fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-[0_8px_30px_rgba(249,115,22,0.4)] border border-white/40 backdrop-blur-2xl hover:-translate-y-2 hover:scale-105 hover:shadow-[0_15px_40px_rgba(249,115,22,0.6)] transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-orange-500/50 glass-sheen overflow-hidden"
      aria-label="Open support chat"
    >
      {/* Dynamic Sheen Effect */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
      
      <MessageCircle size={28} className="relative z-10 drop-shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
    </button>
  )
}
