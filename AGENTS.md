# JusGaming — Agentes de Desenvolvimento

> Este arquivo define os 6 agentes especializados e seus prompts.
> Execute um agente por vez. Só avance para o próximo quando o atual estiver testado e funcionando.

---

## Como usar este arquivo

1. Abra uma nova sessão no Claude Code
2. Cole PRIMEIRO o conteúdo do `CONTEXT.md`
3. Cole DEPOIS o prompt do agente que você quer executar
4. Teste o resultado antes de avançar

---

## AGENTE 1 — Banco de Dados e Migrations

**Objetivo:** Criar toda a estrutura do banco de dados no Supabase.
**Pré-requisito:** Nenhum — é o primeiro agente.
**Tempo estimado:** 1-2 sessões.

**Prompt:**

```
Você é o Agente 1 do projeto JusGaming. Sua única responsabilidade é criar
a estrutura completa do banco de dados.

Leia o CONTEXT.md acima. Ele contém o modelo de dados completo com 14 tabelas.

Sua tarefa:

1. Criar o arquivo `nextjs/supabase/migrations/001_initial_schema.sql` com:
   - Todas as 14 tabelas exatamente como definidas no CONTEXT.md
   - Todos os ENUMs necessários
   - Todas as foreign keys
   - Índices nas colunas mais usadas (institution_id, case_id, team_id)
   - Função para gerar sequence_number automático por case_id

2. Criar o arquivo `nextjs/supabase/migrations/002_rls_policies.sql` com:
   - Row Level Security (RLS) habilitado em todas as tabelas
   - Políticas que garantem que cada usuário só vê dados do seu institution_id
   - Política especial para case_templates com institution_id null (biblioteca global — todos podem ler)
   - Políticas para professors verem todos os dados da sua turma
   - Políticas para students verem apenas os casos em que participam

3. Criar o arquivo `nextjs/supabase/migrations/003_triggers.sql` com:
   - Trigger: quando documento é inserido com document_type IN ('petition','counterclaim','appeal_ed','appeal_general','incident_request','document_filing','other') E uploaded_by IS NOT NULL → inserir automaticamente certificate_conclusion
   - Trigger: quando documento é inserido com document_type IN ('order','decision','intimation','sentence','minutes','saneamento') E uploaded_by IS NOT NULL → inserir automaticamente certificate_publication
   - Trigger: quando document_type = 'appeal_ai' ou 'appeal_ms' → criar automaticamente novo case com parent_case_id preenchido
   - Função para calcular próximo sequence_number por case_id

4. Criar o arquivo `nextjs/supabase/migrations/004_seed_presets.sql` com:
   - Dados iniciais da tabela deadline_presets para civil_first, civil_appeal e arbitration

Regras importantes:
- Nunca usar sequence_number global — sempre por case_id
- Certidões automáticas têm uploaded_by = null e team_id = null
- O triggered_by das certidões deve apontar para o documento que as gerou
- RLS deve usar auth.uid() do Supabase Auth

Depois de criar os arquivos, me mostre como rodar as migrations no Supabase.
```

---

## AGENTE 2 — Autenticação e Turmas

**Objetivo:** Login, cadastro, gestão de turmas e times.
**Pré-requisito:** Agente 1 concluído e migrations rodadas.
**Tempo estimado:** 1-2 sessões.

**Prompt:**

```
Você é o Agente 2 do projeto JusGaming. Sua responsabilidade é construir
autenticação e gestão de turmas.

Leia o CONTEXT.md acima.

Suas tarefas:

1. AUTENTICAÇÃO
   - Página de login: /login (email + senha)
   - Página de cadastro: /register?code=CODIGO_DA_TURMA
     * Aluno informa: nome completo, email, senha
     * Sistema valida o código da turma, cria o usuário e já o vincula à turma
   - SSO Google (opcional, se o boilerplate já suportar)
   - Logout
   - Proteção de rotas: usuário não autenticado → redirect para /login

2. PAINEL DO PROFESSOR — GESTÃO DE TURMAS
   Rota: /dashboard/professor
   - Listar turmas do professor
   - Criar nova turma (nome, semestre, gerar código automático de 6 caracteres)
   - Ver código da turma para compartilhar com alunos
   - Listar alunos de cada turma
   - Bloquear/desbloquear aluno
   - Remover aluno da turma
   - Toggle: notificações por e-mail ativadas/desativadas por turma

3. PAINEL DO ALUNO — ENTRADA
   Rota: /dashboard/aluno
   - Mostrar todas as turmas em que o aluno está matriculado
   - Mostrar os casos ativos de cada turma com o papel do aluno (Autor/Réu/Juiz)

Regras importantes:
- Sempre filtrar por institution_id — nunca mostrar dados de outro tenant
- Um aluno pode estar em múltiplas turmas simultaneamente
- O código da turma deve ser único, maiúsculo, 6 caracteres alfanuméricos
- Professor só vê turmas que ele criou
```

---

## AGENTE 3 — Casos e Templates

**Objetivo:** Criação e gestão de casos, biblioteca de templates, configuração de times.
**Pré-requisito:** Agente 2 concluído.
**Tempo estimado:** 2 sessões.

**Prompt:**

```
Você é o Agente 3 do projeto JusGaming. Sua responsabilidade é construir
o sistema de casos e templates.

Leia o CONTEXT.md acima.

Suas tarefas:

1. BIBLIOTECA DE CASOS (professor)
   Rota: /dashboard/professor/biblioteca
   - Listar templates disponíveis (globais + os criados pelo professor)
   - Card por template: título, matéria, tipo (cível/arbitragem), instância
   - Botão: "Usar este caso" → cria instância para uma turma
   - Botão: "Criar caso do zero" → formulário de criação

2. CRIAÇÃO DE CASO (professor)
   Rota: /dashboard/professor/casos/novo
   Formulário com:
   - Título do caso
   - Tipo: Civil | Arbitragem
   - Instância: 1ª instância | Recursal | Arbitral
   - Câmara arbitral (se arbitragem): CAMARB | CAM-CCBC | FGV-MAE | CIESP/FIESP
   - Turma: qual turma vai receber este caso
   - Narrativa do Autor (plaintiff_brief): campo de texto rico — este é o e-mail do cliente para o Time Autor
   - Narrativa do Réu (defendant_brief): campo de texto rico — este é o e-mail do cliente para o Time Réu
   - Upload de documentos base: para cada documento, definir se vai para Autor, Réu ou Ambos
   - Status inicial: rascunho (não ativa ainda)

3. CONFIGURAÇÃO DE TIMES (professor)
   Rota: /dashboard/professor/casos/[id]/times
   - Criar 3 times: Autor, Réu, Juiz
   - Adicionar alunos da turma a cada time (máx 6 por time, mín 2)
   - Sugestão visual: manter Time Juiz com número ímpar
   - Um aluno só pode estar em um time por caso

4. ATIVAÇÃO DO CASO (professor)
   - Botão "Ativar caso" — só disponível se todos os times tiverem ao menos 2 membros
   - Ao ativar:
     * status muda para 'active'
     * Sistema dispara e-mail/notificação do cliente para Time Autor (plaintiff_brief)
     * Registra activated_at

5. LISTAGEM DE CASOS DO PROFESSOR
   Rota: /dashboard/professor/casos
   - Tabela com todos os casos da turma
   - Colunas: nome, tipo, status, último ato, notificações ativas, ações
   - Ações por caso: ver autos, fato novo, avaliar, configurar
   - Badge vermelho quando há recurso pendente de julgamento
```

---

## AGENTE 4 — Autos do Processo (Core)

**Objetivo:** A tela central do sistema — os autos digitais com upload, certidões automáticas e notificações.
**Pré-requisito:** Agente 3 concluído e pelo menos 1 caso ativo para testar.
**Tempo estimado:** 3-4 sessões. É o agente mais complexo.

**Prompt:**

```
Você é o Agente 4 do projeto JusGaming. Sua responsabilidade é construir
os autos digitais — o coração do sistema.

Leia o CONTEXT.md acima com atenção especial às Regras de Negócio Críticas.

Suas tarefas:

1. TELA DOS AUTOS
   Rota: /dashboard/casos/[id]/autos
   Layout:
   - Sidebar esquerda: nome do caso, navegação (Autos | Incidentes | E-mails do Cliente | Times), outros casos do usuário, papel do usuário no caso
   - Área principal: lista cronológica de documentos
   - Rodapé fixo: barra de protocolo (filtrada por papel)

2. LISTA DE DOCUMENTOS (estilo eProc)
   Colunas: ID (sequence_number formatado como 001) | Ato/Documento | Tipo | Protocolado por | Data/Hora | Baixar PDF
   
   Visual por tipo:
   - Peças dos times: fundo branco, badge colorido por tipo
   - Certidões do sistema: fundo cinza claro, ícone de robô, texto "Sistema"
   - Documento do próprio usuário: destaque sutil em azul
   - Ponto verde/cinza: indica se o professor já avaliou (verde = avaliado e publicado)

3. BARRA DE PROTOCOLO
   - Dropdown: tipo de ato (filtrado pelo papel do usuário — ver CONTEXT.md)
   - Input: título do documento
   - Botão: Anexar PDF
   - Botão: Protocolar

   Ao protocolar:
   a. Upload do PDF para Supabase Storage
   b. INSERT em documents com sequence_number = MAX(sequence_number)+1 para aquele case_id
   c. Se uploader é advogado: disparar certidão de conclusão automática
   d. Se uploader é juiz: disparar certidão de publicação automática
   e. Se document_type = 'appeal_ai' ou 'appeal_ms': criar incidente automaticamente
   f. INSERT em notifications para os participantes relevantes
   g. Se email_notifications_enabled = true na turma: chamar Resend

4. E-MAILS DO CLIENTE
   Rota: /dashboard/casos/[id]/cliente
   - Lista de mensagens recebidas do cliente (notifications tipo 'case_activated' e 'citation')
   - Cada mensagem abre em modal com o texto completo e os documentos anexos
   - Visual: simula interface de e-mail, não de notificação do sistema

5. NOTIFICAÇÕES INTERNAS
   - Sino no header com badge numérico
   - Lista de notificações não lidas (read_at = null)
   - Ao clicar: marca como lida (preenche read_at) e navega para os autos

Regras críticas (não pular):
- sequence_number SEMPRE sequencial por case_id — nunca global
- Certidões automáticas SEMPRE geradas — nunca opcionais
- Barra de protocolo SEMPRE filtrada pelo papel do usuário naquele case
- Avaliação NUNCA visível ao aluno se published_at = null
```

---

## AGENTE 5 — Incidentes (AI e MS)

**Objetivo:** Aba de incidentes com autos apartados para Agravo de Instrumento e Mandado de Segurança.
**Pré-requisito:** Agente 4 concluído.
**Tempo estimado:** 2 sessões.

**Prompt:**

```
Você é o Agente 5 do projeto JusGaming. Sua responsabilidade é construir
o sistema de incidentes processuais (Agravo de Instrumento e Mandado de Segurança).

Leia o CONTEXT.md acima.

Suas tarefas:

1. ABA DE INCIDENTES
   Rota: /dashboard/casos/[id]/incidentes
   - Lista de incidentes do caso (AI e MS)
   - Cada incidente é um card expansível com seus próprios autos
   - Badge no menu lateral quando há incidente ativo
   - Banner informativo: "O processo principal continua em andamento"

2. AUTOS DO INCIDENTE
   Dentro do card do incidente:
   - Lista de documentos com numeração própria (001, 002, 003...)
   - Independente da numeração dos autos principais
   - Mesma lógica de certidões automáticas dos autos principais
   - Barra de protocolo com tipos específicos do incidente:
     * Todos os participantes podem protocolar
     * Professor vê: Acórdão, Decisão monocrática, Pedido de esclarecimentos, Outros
     * Times advogados veem: Complementação, Contrarrazões, Desistência, Outros

3. REFERÊNCIA CRUZADA NOS AUTOS PRINCIPAIS
   - O documento que originou o incidente (ex: ID 010 = AI interposto) aparece nos autos principais com badge "AI" ou "MS"
   - Link visual para a aba de incidentes
   - Quando professor decide no incidente:
     * Notificação automática nos autos principais
     * Inserir documento de referência nos autos principais: "Decisão do AI [número] — ver aba Incidentes"

4. FLUXO DE CRIAÇÃO AUTOMÁTICA DO INCIDENTE
   Quando aluno protocola appeal_ai ou appeal_ms nos autos principais:
   a. Documento inserido nos autos principais normalmente (com sequence_number)
   b. Sistema cria novo case: parent_case_id = caso principal, incident_type = 'appeal_ai'
   c. Novo case tem seus próprios teams (copiados do caso principal)
   d. Notificação ao professor: "Recurso interposto — aguarda julgamento"
   e. Badge vermelho aparece no painel do professor

5. ENCERRAMENTO DO INCIDENTE
   Quando professor protocola acórdão ou decisão monocrática:
   - Status do incidente muda para 'closed'
   - Card fica recolhido e esmaecido na lista
   - Referência cruzada inserida nos autos principais
   - Notificação para todos os times do caso principal
```

---

## AGENTE 6 — Avaliação e Painel do Professor

**Objetivo:** Sistema de avaliação de peças, painel completo do professor e fato novo.
**Pré-requisito:** Agentes 4 e 5 concluídos.
**Tempo estimado:** 2 sessões.

**Prompt:**

```
Você é o Agente 6 do projeto JusGaming. Sua responsabilidade é construir
o sistema de avaliação e o painel completo do professor.

Leia o CONTEXT.md acima.

Suas tarefas:

1. AVALIAÇÃO POR DOCUMENTO (professor)
   Rota: /dashboard/professor/casos/[id]/avaliar
   - Lista de documentos protocolados pelos times (excluindo certidões do sistema)
   - Para cada documento: visualizar PDF, preencher rubrica, dar nota (0-10), escrever comentário
   - Rubrica por tipo de peça (rubric_data em jsonb):
     * Tempestividade
     * Pressupostos processuais
     * Qualidade da fundamentação
     * Uso da prova documental
     * Coerência da argumentação
   - Botão "Salvar rascunho" → published_at = null (só professor vê)
   - Botão "Publicar feedback" → published_at = now() (aluno passa a ver)
   - Ponto verde aparece no documento nos autos quando publicado

2. AVALIAÇÃO POR TIME (professor — ao final do caso)
   - Formulário por time: nota geral (0-10) + comentário livre
   - Só disponível quando case.status = 'closed'

3. FEEDBACK VISÍVEL AO ALUNO
   - Nos autos, ao clicar num documento próprio avaliado e publicado:
     * Modal com: nota, comentário do professor, checklist da rubrica
   - Aba "Avaliações" no painel do aluno:
     * Lista de todas as peças avaliadas e publicadas
     * Nota por peça + nota geral do time (quando disponível)

4. FATO NOVO (professor)
   Rota: /dashboard/professor/casos/[id]/fato-novo
   - Campo de texto: mensagem do cliente (linguagem natural, não jurídica)
   - Upload de documentos adicionais (opcional)
   - Seleção de destinatários: Time Autor | Time Réu | Ambos
   - Preview do e-mail antes de enviar
   - Ao confirmar:
     * INSERT em notifications tipo 'case_activated' (reutilizando o tipo, mas com flag de fato novo)
     * Se email_notifications_enabled: dispara Resend simulando e-mail do cliente
     * NÃO insere nos autos (fato novo é externo ao processo)

5. PAINEL DO PROFESSOR (visão geral)
   Rota: /dashboard/professor
   - Métricas: alunos ativos, casos em andamento, peças protocoladas, avaliações pendentes
   - Tabela de casos: nome, tipo, status, último ato, ícone de notificações, ações rápidas
   - Bloco de pendências: peças aguardando avaliação + recursos aguardando julgamento
   - Ações rápidas por caso: ver autos, fato novo, avaliar, configurar times, ativar/encerrar
```

---

## Ordem de execução recomendada

```
Agente 1 → testar migrations no Supabase
Agente 2 → testar login e cadastro
Agente 3 → criar um caso de teste, configurar times, ativar
Agente 4 → protocolar peças, verificar certidões automáticas
Agente 5 → interpor AI, verificar autos do incidente
Agente 6 → avaliar peças, testar fato novo
```

## Dicas para cada sessão

- Sempre cole o CONTEXT.md antes do prompt do agente
- Se der erro, cole a mensagem de erro completa para o Claude Code
- Teste cada feature antes de pedir a próxima
- Commite com mensagens claras: "Agente 1: migrations criadas", "Agente 2: login funcionando"
- O deploy no Vercel é automático a cada commit — verifique em vercel.com
