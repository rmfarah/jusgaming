'use client'

import { useState } from 'react'
import { markNotificationRead } from '@/lib/actions/documents'
import type { JusNotification } from '@/lib/jusgaming.types'
import { X, Mail, Paperclip } from 'lucide-react'
import DocumentDownloadButton from '@/components/DocumentDownloadButton'

interface Props {
  children: React.ReactNode
  notification: JusNotification & {
    cases?: { title: string }
    documents?: { id?: string; title: string; sequence_number: number; file_path?: string | null } | null
  }
}

export default function ClienteEmailModal({ children, notification }: Props) {
  const [open, setOpen] = useState(false)

  const handleOpen = async () => {
    setOpen(true)
    if (!notification.read_at) {
      // Mark as read
      await markNotificationRead(notification.id)
    }
  }

  const isActivation = notification.notification_type === 'case_activated'
  const isFatoNovo = notification.notification_type === 'fato_novo'
  const attachment =
    notification.documents?.id && notification.documents.file_path
      ? notification.documents
      : null

  return (
    <>
      <div onClick={handleOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleOpen()}>
        {children}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-[#185FA5]/10 flex items-center justify-center flex-shrink-0">
                <Mail className="h-4 w-4 text-[#185FA5]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">
                  {isActivation
                    ? 'Contratação de Serviços Advocatícios'
                    : isFatoNovo
                      ? 'Fato Novo — Mensagem do Cliente'
                      : 'Comunicação — Polo Passivo'}
                </p>
                <h3 className="font-semibold text-gray-900 text-sm truncate">
                  {notification.email_subject ?? 'Sem assunto'}
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Email metadata */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 space-y-1">
              <div className="flex gap-2">
                <span className="font-medium text-gray-600 w-12">De:</span>
                <span>cliente@{notification.cases?.title ? 'caso' : 'juscase'}.com.br</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-gray-600 w-12">Assunto:</span>
                <span>{notification.email_subject ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-gray-600 w-12">Data:</span>
                <span>
                  {new Date(notification.created_at).toLocaleString('pt-BR', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {notification.email_body ? (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {notification.email_body}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Sem conteúdo.</p>
              )}
            </div>

            {/* Attachment */}
            {attachment && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 bg-gray-50">
                <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 flex-1 truncate">{attachment.title}</span>
                <DocumentDownloadButton documentId={attachment.id!} />
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
