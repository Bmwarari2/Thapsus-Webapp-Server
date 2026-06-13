import React, { useState } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Retailer link rendered as a compact host label + two actions instead of a
 * raw, wrapping URL (which looked broken in the buy-for-me queues):
 *   • Open — launches the link in a new tab
 *   • Copy — puts the full URL on the clipboard to paste into the retailer
 *
 * Shared by the operator queue (OpsBuyForMe) and the customer's own
 * concierge order list (BuyForMe).
 */
export const RetailerLink = ({ url }) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy link')
    }
  }

  let host = url
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* leave raw */ }

  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <span className="text-xs text-mute truncate max-w-[160px]" title={url}>{host}</span>
      <a href={url} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-line text-ember-400 hover:bg-white/[0.04] text-xs font-semibold transition-colors">
        <ExternalLink size={12}/> Open
      </a>
      <button type="button" onClick={copy}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-line text-white/80 hover:bg-white/[0.04] text-xs font-semibold transition-colors">
        {copied ? <Check size={12} className="text-emerald-400"/> : <Copy size={12}/>}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default RetailerLink
