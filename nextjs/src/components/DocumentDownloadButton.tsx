'use client'

import { useState } from 'react'
import { getDocumentDownloadUrl } from '@/lib/actions/documents'
import { Download, Loader2 } from 'lucide-react'

export default function DocumentDownloadButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const result = await getDocumentDownloadUrl(documentId)
      if (result.url) {
        window.open(result.url, '_blank')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title="Baixar PDF"
      className="inline-flex items-center justify-center p-1 rounded text-[#185FA5] hover:bg-blue-50 disabled:opacity-50 transition-colors"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
