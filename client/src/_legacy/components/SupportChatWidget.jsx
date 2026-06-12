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
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
      aria-label="Open support chat"
    >
      <MessageCircle size={24} />
    </button>
  )
}
