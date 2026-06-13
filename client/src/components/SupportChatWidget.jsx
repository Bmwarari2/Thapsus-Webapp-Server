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
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 right-4 lg:right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ember-gradient text-white shadow-ember hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-ink transition"
      aria-label="Open support chat"
    >
      <MessageCircle size={24} />
    </button>
  )
}
