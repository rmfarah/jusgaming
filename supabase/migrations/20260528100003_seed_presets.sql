-- =============================================================================
-- JusGaming — Migration 004: Seed — Presets de Prazo
--
-- Dados de referência para deadline_presets.
-- São sugestões; o sistema NÃO calcula prazos automaticamente.
-- Prazos em dias corridos (referência ao CPC/Lei de Arbitragem).
-- =============================================================================

INSERT INTO deadline_presets (case_type, label, default_days, description, sort_order) VALUES

-- ---------------------------------------------------------------------------
-- CIVIL — 1ª INSTÂNCIA
-- ---------------------------------------------------------------------------
('civil_first', 'Petição Inicial',           0,  'Protocolo da petição inicial pelo Time Autor.', 1),
('civil_first', 'Citação / Vista ao Réu',    15, 'Prazo para o Time Réu após ser citado.', 2),
('civil_first', 'Contestação',               15, 'Art. 335 CPC — 15 dias úteis após citação.', 3),
('civil_first', 'Exceção de Incompetência',  15, 'Alegada como preliminar na contestação.', 4),
('civil_first', 'Réplica',                   15, 'Art. 351 CPC — resposta à contestação.', 5),
('civil_first', 'Especificação de Provas',   15, 'Intimação para especificar provas a produzir.', 6),
('civil_first', 'Decisão de Saneamento',      0, 'Juiz fixa pontos controvertidos e provas.', 7),
('civil_first', 'Audiência de Instrução',    30, 'Designação de AIJ após saneamento.', 8),
('civil_first', 'Memoriais / Alegações Finais', 15, 'Art. 364 CPC — prazo para cada parte.', 9),
('civil_first', 'Sentença',                  30, 'Prazo referencial para o Time Juiz.', 10),
('civil_first', 'Apelação',                  15, 'Art. 1.003 CPC — 15 dias úteis da publicação.', 11),
('civil_first', 'Contrarrazões de Apelação', 15, 'Art. 1.010 CPC — mesmos 15 dias.', 12),
('civil_first', 'Embargos de Declaração',     5, 'Art. 1.023 CPC — 5 dias úteis.', 13),

-- ---------------------------------------------------------------------------
-- CIVIL — 2ª INSTÂNCIA / RECURSAL
-- ---------------------------------------------------------------------------
('civil_appeal', 'Razões de Recurso',        15, 'Prazo para apresentar as razões recursais.', 1),
('civil_appeal', 'Contrarrazões',            15, 'Resposta da parte recorrida.', 2),
('civil_appeal', 'Agravo Interno',           15, 'Art. 1.021 CPC — contra decisão do relator.', 3),
('civil_appeal', 'Sustentação Oral',          0, 'Dia do julgamento em plenário.', 4),
('civil_appeal', 'Acórdão',                  60, 'Prazo referencial para lavratura e publicação.', 5),
('civil_appeal', 'Embargos de Declaração',    5, 'Art. 1.023 CPC — 5 dias úteis.', 6),
('civil_appeal', 'Recurso Especial / Extraordinário', 15, 'Art. 1.003 CPC.', 7),

-- ---------------------------------------------------------------------------
-- ARBITRAGEM
-- ---------------------------------------------------------------------------
('arbitration', 'Notificação / Citação',     10, 'Prazo após notificação inicial da câmara.', 1),
('arbitration', 'Resposta à Demanda',        30, 'Réu apresenta resposta, incluindo reconvenção.', 2),
('arbitration', 'Ata de Missão / Termos de Arbitragem', 0, 'Audiência de instalação do tribunal.', 3),
('arbitration', 'Memorial Inicial',          30, 'Prazo após a Ata de Missão.', 4),
('arbitration', 'Réplica',                   20, 'Resposta ao memorial do Autor.', 5),
('arbitration', 'Tréplica',                  20, 'Resposta ao memorial do Réu.', 6),
('arbitration', 'Audiência de Instrução',    45, 'Prazo referencial para designação.', 7),
('arbitration', 'Alegações Finais',          30, 'Após audiência ou instrução documental.', 8),
('arbitration', 'Sentença Arbitral',         90, 'Art. 23 Lei 9.307/96 — prazo padrão.', 9),
('arbitration', 'Embargos de Declaração',     5, 'Art. 30 Lei 9.307/96.', 10),
('arbitration', 'Impugnação ao Valor da Causa', 15, 'Incidente sobre o valor atribuído na demanda.', 11);
