# JusGaming — Contexto do Projeto para o Claude Code

> Este arquivo deve estar na raiz do repositório como `CONTEXT.md`.
> Cole o conteúdo deste arquivo no início de TODA sessão do Claude Code.

---

## O que é o JusGaming

Plataforma educacional SaaS que simula processos judiciais e arbitrais para ensino de Direito Processual Civil em faculdades brasileiras. Alunos ocupam papéis de advogados (autor/réu) e julgadores (juiz/árbitro) em casos práticos. O professor cria os casos, avalia as peças e julga recursos como instância superior.

**Diferencial:** fluxo livre conduzido pelo Time Juiz — sem etapas obrigatórias pré-definidas. Tudo pelos autos, como num processo real.

---

## Stack (decisões fechadas — não alterar)

| Camada | Tecnologia |
|--------|-----------|
| Frontend + Backend | Next.js 15 (App Router) |
| Banco de dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth (email/senha + SSO Google) |
| Storage (PDFs) | Supabase Storage |
| Deploy | Vercel (automático via GitHub) |
| E-mail transacional | Resend |
| Repositório | github.com/rmfarah/jusgaming |
| Boilerplate base | Razikus/supabase-nextjs-template |

---

## Arquitetura — Multi-Tenant

- TODAS as tabelas principais têm `institution_id` (uuid FK → institutions)
- Row Level Security (RLS) do Supabase isola dados por tenant
- No MVP: uma instância, todos usam marca JusGaming
- Pós-MVP: subdomínios por instituição sem refatoração

---

## Modelo de Dados Completo

```sql
-- 1. INSTITUIÇÕES (tenant raiz)
institutions
  id                uuid PK
  name              text
  slug              text unique
  active            boolean
  created_at        timestamp

-- 2. USUÁRIOS
-- Professor em duas instituições = dois registros com e-mails distintos
users
  id                uuid PK  -- gerado pelo Supabase Auth
  institution_id    uuid FK → institutions
  email             text unique
  full_name         text
  role              enum  -- 'admin' | 'professor' | 'student'
  active            boolean
  created_at        timestamp

-- 3. TURMAS
courses
  id                uuid PK
  institution_id    uuid FK → institutions
  professor_id      uuid FK → users
  name              text
  code              text unique  -- código de auto-cadastro (ex: "PC26A")
  semester          text
  active            boolean
  email_notifications_enabled  boolean  -- true = Resend; false = só notificações internas
  created_at        timestamp

-- 4. MEMBROS DA TURMA
course_members
  id                uuid PK
  course_id         uuid FK → courses
  user_id           uuid FK → users
  joined_at         timestamp

-- 5. TEMPLATES DE CASO (biblioteca)
-- institution_id null = biblioteca global da plataforma
case_templates
  id                uuid PK
  institution_id    uuid FK → institutions  -- null = global
  created_by        uuid FK → users
  title             text
  subject           text
  type              enum  -- 'civil' | 'arbitration'
  instance_level    enum  -- 'first' | 'appeal' | 'arbitral'
  arbitration_rules text  -- 'CAMARB' | 'CAM-CCBC' | 'FGV-MAE' | 'CIESP'
  plaintiff_brief   text  -- e-mail do cliente para Time Autor
  defendant_brief   text  -- e-mail do cliente para Time Réu
  is_public         boolean
  created_at        timestamp

-- 6. DOCUMENTOS BASE DO TEMPLATE
case_template_documents
  id                uuid PK
  template_id       uuid FK → case_templates
  recipient         enum  -- 'plaintiff' | 'defendant' | 'both'
  label             text  -- "DOC 01 — Contrato de Prestação..."
  description       text  -- descrição interna
  file_path         text  -- Supabase Storage
  created_at        timestamp

-- 7. CASOS (instâncias ativas numa turma)
-- template_id null = criado do zero pelo professor
-- parent_case_id preenchido = incidente (AI ou MS)
cases
  id                uuid PK
  institution_id    uuid FK → institutions
  course_id         uuid FK → courses
  template_id       uuid FK → case_templates  -- null se criado do zero
  professor_id      uuid FK → users
  parent_case_id    uuid FK → cases           -- null = principal | preenchido = incidente
  incident_type     enum                      -- null | 'appeal_ai' | 'appeal_ms'
  title             text
  type              enum  -- 'civil' | 'arbitration'
  instance_level    enum  -- 'first' | 'appeal' | 'arbitral'
  arbitration_rules text
  status            enum  -- 'draft' | 'active' | 'closed'
  activated_at      timestamp
  closed_at         timestamp
  created_at        timestamp

-- 8. TIMES
teams
  id                uuid PK
  case_id           uuid FK → cases
  role              enum  -- 'plaintiff' | 'defendant' | 'judge'
  name              text  -- "Time Autor", "Time Juiz"
  created_at        timestamp

-- 9. MEMBROS DO TIME
team_members
  id                uuid PK
  team_id           uuid FK → teams
  user_id           uuid FK → users
  joined_at         timestamp

-- 10. DOCUMENTOS NOS AUTOS (coração do sistema)
-- uploaded_by e team_id são null para certidões automáticas do sistema
documents
  id                uuid PK
  case_id           uuid FK → cases
  sequence_number   integer   -- ID sequencial por case (001, 002, 003...)
  uploaded_by       uuid FK → users   -- null se sistema
  team_id           uuid FK → teams   -- null se sistema
  document_type     enum
    -- Times advogados:
    --   'petition'           petição inicial, contestação, réplica, memoriais
    --   'counterclaim'       reconvenção
    --   'appeal_ai'          agravo de instrumento → cria incidente
    --   'appeal_ms'          mandado de segurança → cria incidente
    --   'appeal_ed'          embargos de declaração → autos principais
    --   'appeal_general'     apelação, recurso ordinário
    --   'incident_request'   IDPJ, impugnação valor causa, etc.
    --   'document_filing'    juntada de documento avulso
    --   'other'
    -- Time Juiz:
    --   'order'              despacho
    --   'decision'           decisão interlocutória
    --   'intimation'         intimação
    --   'sentence'           sentença
    --   'minutes'            ata de audiência
    --   'saneamento'         decisão de saneamento
    -- Sistema (automático):
    --   'certificate_conclusion'    autos conclusos ao juiz
    --   'certificate_publication'   publicação no DJe
  title             text
  file_path         text    -- null para certidões do sistema
  certificate_text  text    -- preenchido apenas em certidões automáticas
  triggered_by      uuid FK → documents  -- qual doc gerou esta certidão
  created_at        timestamp

-- 11. NOTIFICAÇÕES / E-MAILS
notifications
  id                uuid PK
  case_id           uuid FK → cases
  document_id       uuid FK → documents   -- null para ativação do caso
  recipient_team_id uuid FK → teams       -- null = todos os times
  notification_type enum
    -- 'case_activated'        e-mail do cliente → Time Autor
    -- 'citation'              e-mail do cliente → Time Réu
    -- 'new_document'          novo ato → participantes
    -- 'new_document_judge'    novo ato → Time Juiz (dispara certidão de conclusão)
  email_subject     text
  email_body        text
  send_email        boolean   -- true = Resend; false = só notificação interna
  read_at           timestamp
  sent_at           timestamp
  status            enum  -- 'pending' | 'sent' | 'failed'
  created_at        timestamp

-- 12. AVALIAÇÕES POR DOCUMENTO
evaluations
  id                uuid PK
  document_id       uuid FK → documents
  professor_id      uuid FK → users
  score             integer   -- 0-10, opcional
  comments          text
  rubric_data       jsonb     -- checklist flexível por tipo de peça
  published_at      timestamp -- null = só professor vê; preenchido = aluno vê
  created_at        timestamp
  updated_at        timestamp

-- 13. AVALIAÇÕES POR TIME (ao final do caso)
case_evaluations
  id                uuid PK
  case_id           uuid FK → cases
  team_id           uuid FK → teams
  professor_id      uuid FK → users
  score             integer
  comments          text
  created_at        timestamp
  updated_at        timestamp

-- 14. PRESETS DE PRAZO (sugestões — não obrigatórios)
deadline_presets
  id                uuid PK
  case_type         enum  -- 'civil_first' | 'civil_appeal' | 'arbitration'
  label             text  -- "Contestação"
  default_days      integer
  description       text
  order             integer
```

---

## Regras de Negócio Críticas

### Certidões automáticas (NUNCA pular)

**Quando time advogado protocola peça:**
1. INSERT documents (peça protocolada)
2. INSERT notifications tipo `new_document` → todos os times
3. INSERT notifications tipo `new_document_judge` → Time Juiz
4. TRIGGER automático: INSERT documents tipo `certificate_conclusion`
   - `certificate_text`: "Certifico que os presentes autos foram conclusos ao MM. Juiz(a) em [data/hora], para os fins de direito."
   - `triggered_by`: id da peça protocolada
   - `uploaded_by`: null (sistema)

**Quando Time Juiz protocola decisão/intimação:**
1. INSERT documents (decisão/intimação)
2. TRIGGER automático: INSERT documents tipo `certificate_publication`
   - `certificate_text`: "Certifico que o ato ID [sequence_number] foi disponibilizado no Diário de Justiça Eletrônico em [data]. Considera-se publicado no primeiro dia útil subsequente, iniciando-se a contagem dos prazos no dia útil seguinte à publicação."
   - `triggered_by`: id da decisão/intimação
   - `uploaded_by`: null (sistema)
3. INSERT notifications tipo `new_document` → times intimados

### Numeração sequencial dos autos

- `sequence_number` é gerado automaticamente por `case_id`
- Certidões automáticas também recebem sequence_number
- Nunca reutilizar números — sempre incrementar
- Exemplo: peça = 001, certidão de conclusão = 002, decisão = 003, certidão de publicação = 004

### Filtro de atos por papel

A barra de protocolo exibe apenas os tipos de ato do papel do usuário naquele case:

| Papel | document_type disponíveis |
|-------|--------------------------|
| Time Autor / Réu | petition, counterclaim, appeal_ai, appeal_ms, appeal_ed, appeal_general, incident_request, document_filing, other |
| Time Juiz | order, decision, intimation, sentence, minutes, saneamento, other |
| Professor | todos + acórdão via appeal_general |

### Incidentes (AI e MS)

Quando aluno protocola `appeal_ai` ou `appeal_ms`:
1. Documento aparece nos autos principais com badge "AI" ou "MS"
2. Sistema cria automaticamente novo `case` com `parent_case_id` = caso principal
3. Incidente tem seus próprios autos com numeração independente começando em 001
4. Aba "Incidentes" no caso principal mostra o incidente
5. Quando professor decide no incidente: notificação automática nos autos principais + referência cruzada

### Prazos

- Sistema NÃO calcula prazos automaticamente
- Prazos são controlados manualmente pelos times
- Sistema oferece apenas sugestões via `deadline_presets`
- Certidão de publicação no DJe é o gatilho para contagem manual

### E-mails

- `email_notifications_enabled` na tabela `courses` controla se Resend é usado
- Se false: só notificação interna na plataforma
- E-mail do cliente (ativação do caso e citação) sempre chegam como se fossem do cliente, não da plataforma
- Resend free tier: 3.000 e-mails/mês

---

## Estrutura de Pastas do Projeto

```
jusgaming/
  nextjs/          ← código Next.js (raiz do Vercel)
    src/
      app/         ← rotas (App Router)
      components/  ← componentes reutilizáveis
      lib/         ← utilitários, clientes Supabase
    supabase/
      migrations/  ← migrations SQL
    .env.local     ← variáveis de ambiente (nunca no GitHub)
```

---

## Variáveis de Ambiente

```
NEXT_PUBLIC_SUPABASE_URL=https://kfpftaolsyglfmmjlcee.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[publishable key]
SUPABASE_SERVICE_ROLE_KEY=[secret key]
RESEND_API_KEY=[a configurar]
```

---

## Identidade Visual

- Estilo: institucional/sóbrio
- Cores primárias: azul #185FA5, cinza escuro
- Tipografia: clean, sem serifa
- Referência visual: eProc (sistema processual federal brasileiro)
- Desktop-first (notebook em sala de aula)

---

## O que NÃO fazer

- Nunca calcular prazos automaticamente
- Nunca criar chat interno — comunicação só pelos autos
- Nunca mostrar avaliação ao aluno antes de `published_at` estar preenchido
- Nunca ignorar o `institution_id` nas queries — sempre filtrar por tenant
- Nunca pular as certidões automáticas
- Nunca permitir que aluno veja `document_type` de outro papel na barra de protocolo
