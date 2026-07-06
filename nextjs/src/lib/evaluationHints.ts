export interface EvaluationHint {
  text: string
  ref?: string
}

export const EVALUATION_HINTS: Partial<Record<string, EvaluationHint[]>> = {
  petition: [
    { text: 'Partes indicadas corretamente (nome, qualificação, endereço)?', ref: 'art. 319, I CPC' },
    { text: 'Fatos narrados de forma clara e coerente?', ref: 'art. 319, III CPC' },
    { text: 'Fundamentos jurídicos expostos?', ref: 'art. 319, III CPC' },
    { text: 'Pedido certo e determinado?', ref: 'art. 322 CPC' },
    { text: 'Valor da causa atribuído?', ref: 'art. 319, V e art. 291 CPC' },
    { text: 'Requerimento de audiência de conciliação ou mediação?', ref: 'art. 319, VII e art. 334 CPC' },
    { text: 'Protesto por provas indicado?', ref: 'art. 319, VI CPC' },
    { text: 'Documentos indispensáveis juntados (art. 320)?', ref: 'art. 320 CPC' },
  ],
  counterclaim: [
    { text: 'Réu formulou pedido próprio em face do autor?', ref: 'art. 343 CPC' },
    { text: 'Conexão com a causa principal ou fundamento de defesa demonstrada?', ref: 'art. 343 CPC' },
    { text: 'Competência observada (mesmo juízo)?', ref: 'art. 343 §1º CPC' },
    { text: 'Pedido reconvencional é certo e determinado?', ref: 'art. 322 CPC' },
    { text: 'Reconvenção apresentada na contestação ou em peça separada?', ref: 'art. 343 CPC' },
  ],
  appeal_ai: [
    { text: 'Decisão agravada é interlocutória (não é sentença)?', ref: 'art. 1.015 CPC' },
    { text: 'Hipótese de cabimento expressamente prevista?', ref: 'art. 1.015, I–XIII CPC' },
    { text: 'Prazo de 15 dias observado?', ref: 'art. 1.003 §5º CPC' },
    { text: 'Peças obrigatórias foram juntadas (decisão agravada, procuração, outros)?', ref: 'art. 1.017 CPC' },
    { text: 'Requerimento de efeito suspensivo ou antecipação de tutela recursal?', ref: 'art. 1.019, I CPC' },
  ],
  appeal_ms: [
    { text: 'Direito líquido e certo demonstrado por prova documental pré-constituída?', ref: 'art. 1º Lei 12.016/09' },
    { text: 'Prazo de 120 dias da ciência do ato coator observado?', ref: 'art. 23 Lei 12.016/09' },
    { text: 'Autoridade coatora corretamente identificada?', ref: 'art. 6º Lei 12.016/09' },
    { text: 'Pedido de liminar fundamentado (fumus boni iuris + periculum in mora)?', ref: 'art. 7º, III Lei 12.016/09' },
  ],
  appeal_ed: [
    { text: 'Vício apontado é obscuridade, contradição, omissão ou erro material?', ref: 'art. 1.022 CPC' },
    { text: 'Prazo de 5 dias úteis observado?', ref: 'art. 1.023 CPC' },
    { text: 'O ponto omitido ou contraditório foi expressamente indicado?', ref: 'art. 1.022 CPC' },
    { text: 'Evitou usar ED como recurso protelatório?', ref: 'art. 1.026 §2º CPC' },
  ],
  appeal_general: [
    { text: 'Prazo de 15 dias úteis observado?', ref: 'art. 1.003 §5º CPC' },
    { text: 'Preparo (custas) recolhido?', ref: 'art. 1.007 CPC' },
    { text: 'Fundamentos da sentença impugnados especificamente?', ref: 'art. 1.010, II e III CPC' },
    { text: 'Pedido de nova decisão claramente formulado?', ref: 'art. 1.010, IV CPC' },
    { text: 'Requerimento de sustentação oral (se cabível)?', ref: 'art. 937 CPC' },
  ],
  incident_request: [
    { text: 'Fundamento legal específico indicado?', ref: 'CPC' },
    { text: 'Pertinência com o estado atual do processo demonstrada?', ref: '' },
    { text: 'Urgência justificada (se requerimento cautelar)?', ref: 'art. 300 CPC' },
  ],
  document_filing: [
    { text: 'Relevância do documento para os fatos controvertidos demonstrada?', ref: 'art. 369 CPC' },
    { text: 'Documento autêntico ou cópia com declaração de autenticidade?', ref: 'art. 425 CPC' },
    { text: 'Contraditório observado (intimação da parte contrária)?', ref: 'art. 437 CPC' },
  ],
  order: [
    { text: 'Impulso oficial motivado (mesmo que brevemente)?', ref: 'art. 203 §3º CPC' },
    { text: 'Prazo adequado fixado para as partes?', ref: 'art. 218 CPC' },
  ],
  decision: [
    { text: 'Fundamentação mínima presente (não é despacho)?', ref: 'art. 203 §2º e art. 489 CPC' },
    { text: 'Questão incidental resolvida sem encerrar o processo?', ref: 'art. 203 §2º CPC' },
    { text: 'Contraditório prévio observado (ou urgência justificada)?', ref: 'art. 9º CPC' },
  ],
  sentence: [
    { text: 'Relatório presente (nome das partes, pedido, sumário do processo)?', ref: 'art. 489, I CPC' },
    { text: 'Fundamentação analítica (não genérica ou por remissão)?', ref: 'art. 489, II e §1º CPC' },
    { text: 'Dispositivo claro e completo (procedente/improcedente + condenações)?', ref: 'art. 489, III CPC' },
    { text: 'Todos os pedidos foram apreciados?', ref: 'art. 492 CPC' },
    { text: 'Honorários advocatícios fixados?', ref: 'art. 85 CPC' },
    { text: 'Custas distribuídas?', ref: 'art. 82 CPC' },
  ],
  saneamento: [
    { text: 'Questões processuais (preliminares) resolvidas?', ref: 'art. 357, I CPC' },
    { text: 'Pontos controvertidos de fato e de direito fixados?', ref: 'art. 357, II CPC' },
    { text: 'Distribuição do ônus da prova definida?', ref: 'art. 357, III CPC' },
    { text: 'Provas admitidas e as impertinentes indeferidas?', ref: 'art. 357, IV CPC' },
    { text: 'Audiência de instrução designada ou não (com justificativa)?', ref: 'art. 357 §3º CPC' },
  ],
  minutes: [
    { text: 'Data, hora e local registrados?', ref: 'art. 367 CPC' },
    { text: 'Partes e advogados presentes identificados?', ref: 'art. 367 CPC' },
    { text: 'Depoimentos das partes/testemunhas registrados ou resumidos?', ref: 'art. 460 CPC' },
    { text: 'Alegações finais orais ou prazo para memoriais?', ref: 'art. 364 CPC' },
  ],
  complementation: [
    { text: 'Atende ao que o tribunal solicitou (complementação específica)?', ref: '' },
    { text: 'Prazo observado?', ref: 'CPC' },
    { text: 'Argumentos novos são pertinentes ao recurso original?', ref: '' },
  ],
  counterargument: [
    { text: 'Cada fundamento do recurso foi expressamente rebatido?', ref: 'art. 1.010 §1º CPC' },
    { text: 'Prazo de 15 dias úteis observado?', ref: 'art. 1.003 §5º CPC' },
    { text: 'Pedido de manutenção da decisão recorrida formulado?', ref: '' },
  ],
  acordao: [
    { text: 'Ementa clara e informativa?', ref: 'art. 943 CPC' },
    { text: 'Relatório: síntese do caso e do recurso?', ref: 'art. 943 CPC' },
    { text: 'Votos de cada membro do colegiado?', ref: 'art. 941 CPC' },
    { text: 'Resultado (provido/improvido) declarado explicitamente?', ref: 'art. 942 CPC' },
    { text: 'Fundamentação não genérica (rebate argumentos do recurso)?', ref: 'art. 489 §1º CPC' },
  ],
  decision_monocratica: [
    { text: 'Hipótese de julgamento monocrático presente (art. 932)?', ref: 'art. 932 CPC' },
    { text: 'Fundamento legal da decisão monocrática indicado?', ref: 'art. 932, IV–V CPC' },
    { text: 'Fundamentação analítica (não genérica)?', ref: 'art. 489 §1º CPC' },
  ],
}
