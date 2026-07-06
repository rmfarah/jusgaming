/**
 * emailTemplates.ts — HTML e-mail templates for JusGaming
 *
 * Two templates:
 *  - clientEmailTemplate     : simulates a fictional client contacting the lawyer team
 *  - notificationEmailTemplate: notifies participants of a new court filing
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

/**
 * Template "e-mail do cliente" — sent to plaintiff on activation
 * and to defendant on citation.
 *
 * Displays the professor-configured brief as the client's message.
 */
export function clientEmailTemplate(body: string, caseUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0a1628;padding:20px 28px;display:flex;align-items:center;gap:12px;">
      <span style="color:#fff;font-weight:700;font-size:18px;">JusGaming</span>
      <span style="color:#93c5fd;font-size:13px;margin-left:4px;">· Mensagem do cliente</span>
    </div>
    <div style="padding:28px;color:#1a1a1a;">
      <div style="white-space:pre-line;line-height:1.75;font-size:15px;margin-bottom:32px;color:#374151;">
${body}
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:24px;">
        <a href="${caseUrl}"
           style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
          Acessar a plataforma →
        </a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">
        Este e-mail foi gerado automaticamente pelo JusGaming — Simulador de Processos Judiciais para Ensino de Direito.
      </p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Template de notificação de novo ato — sent to case participants when a
 * new document is filed (new_document / new_document_judge).
 */
export function notificationEmailTemplate(opts: {
  caseTitle: string
  actTitle: string
  actId: number
  authorName: string
  dateTime: string
  caseUrl: string
}): string {
  const { caseTitle, actTitle, actId, authorName, dateTime, caseUrl } = opts
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0a1628;padding:20px 28px;">
      <span style="color:#fff;font-weight:700;font-size:18px;">JusGaming</span>
      <span style="color:#93c5fd;font-size:13px;margin-left:8px;">· Notificações</span>
    </div>
    <div style="padding:28px;color:#1a1a1a;">
      <p style="font-size:15px;margin:0 0 20px;">
        Novo ato protocolado nos autos do caso <strong>${caseTitle}</strong>.
      </p>
      <div style="background:#f5f7fa;border-radius:8px;padding:18px;margin:0 0 24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:12px;color:#6b7280;padding:0 0 4px;">ID do ato</td>
          </tr>
          <tr>
            <td style="font-size:22px;font-weight:700;color:#185FA5;padding:0 0 14px;">
              ${String(actId).padStart(3, '0')}
            </td>
          </tr>
          <tr><td style="font-size:12px;color:#6b7280;padding:0 0 4px;">Ato</td></tr>
          <tr><td style="font-size:15px;padding:0 0 14px;">${actTitle}</td></tr>
          <tr><td style="font-size:12px;color:#6b7280;padding:0 0 4px;">Protocolado por</td></tr>
          <tr><td style="font-size:15px;padding:0 0 14px;">${authorName}</td></tr>
          <tr><td style="font-size:12px;color:#6b7280;padding:0 0 4px;">Data/hora</td></tr>
          <tr><td style="font-size:15px;">${dateTime}</td></tr>
        </table>
      </div>
      <a href="${caseUrl}"
         style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
        Ver nos autos →
      </a>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">
        JusGaming — Simulador de Processos Judiciais para Ensino de Direito.
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Citação com cópia integral dos autos ─────────────────────────────────────

export interface AutosCopyRow {
  seq: number
  title: string
  typeLabel: string
  dateTime: string
  certificateText?: string | null
  downloadUrl?: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Template de citação do réu — mensagem do cliente + cópia integral dos autos
 * (todos os atos até a citação, incluindo a certidão positiva de citação).
 * PDFs acompanham como links assinados com validade de 7 dias.
 */
export function citationEmailTemplate(opts: {
  brief: string
  caseTitle: string
  caseUrl: string
  rows: AutosCopyRow[]
}): string {
  const { brief, caseTitle, caseUrl, rows } = opts

  const rowsHtml = rows
    .map((r) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-family:monospace;font-size:13px;color:#6b7280;white-space:nowrap;">
            ${String(r.seq).padStart(3, '0')}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div style="font-size:14px;color:#111827;font-weight:600;">${escapeHtml(r.title)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(r.typeLabel)} · ${escapeHtml(r.dateTime)}</div>
            ${r.certificateText ? `<div style="font-size:12px;color:#4b5563;margin-top:6px;font-style:italic;line-height:1.5;">${escapeHtml(r.certificateText)}</div>` : ''}
            ${r.downloadUrl ? `<div style="margin-top:6px;"><a href="${r.downloadUrl}" style="font-size:12px;color:#185FA5;font-weight:700;text-decoration:none;">⬇ Baixar PDF</a></div>` : ''}
          </td>
        </tr>`)
    .join('')

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0a1628;padding:20px 28px;">
      <span style="color:#fff;font-weight:700;font-size:18px;">JusGaming</span>
      <span style="color:#93c5fd;font-size:13px;margin-left:8px;">· Citação — ${escapeHtml(caseTitle)}</span>
    </div>
    <div style="padding:28px;color:#1a1a1a;">
      <div style="white-space:pre-line;line-height:1.75;font-size:15px;margin-bottom:28px;color:#374151;">
${brief}
      </div>

      <div style="border-top:1px solid #e5e7eb;padding-top:24px;margin-bottom:28px;">
        <p style="font-size:14px;font-weight:700;color:#111827;margin:0 0 4px;">📎 Cópia integral dos autos</p>
        <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">
          Acompanha esta citação a cópia integral dos autos até a presente data,
          incluindo a certidão positiva de citação. Os links de download são válidos por 7 dias.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
${rowsHtml}
        </table>
      </div>

      <a href="${caseUrl}"
         style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
        Acessar os autos na plataforma →
      </a>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">
        Este e-mail foi gerado automaticamente pelo JusGaming — Simulador de Processos Judiciais para Ensino de Direito.
      </p>
    </div>
  </div>
</body>
</html>`
}

export { APP_URL }
