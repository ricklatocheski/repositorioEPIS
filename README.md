# Controle de EPIs · Balança

Sistema sem página de login, com interface inspirada no catálogo Guararapes enviado pelo solicitante. Inclui cadastros reutilizáveis, empréstimos com múltiplos EPIs, devoluções parciais, perdas, estoque, relatórios e backup.

[Publicar no Netlify](https://app.netlify.com/start/deploy?repository=https://github.com/ricklatocheski/repositorioEPIS)

## Publicar

Use **Import an existing project → GitHub → ricklatocheski/repositorioEPIS**, branch **main**. O `netlify.toml` configura o build automaticamente:

| Campo | Valor |
|---|---|
| Base directory | vazio / raiz do repositório |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |
| Node.js | 22 |

O projeto inclui o pacote `@netlify/database` e a migração SQL. Em contas compatíveis, o Netlify provisiona o PostgreSQL e aplica a migração durante o deploy. Confira em **Data & Storage → Database**. Se a conta exigir ativação, habilite o banco nessa tela e publique novamente. Observe o consumo e as condições do seu plano antes de ativar serviços. Não foi criado banco pago em sua conta nesta entrega.

Não use o envio de ZIP por arrastar e soltar para publicar este sistema completo: essa modalidade publica arquivos estáticos, sem executar o build e preparar a API. O ZIP é o código-fonte completo para guardar, editar ou importar no repositório. Para a publicação com banco, use a integração Git acima.

Depois do deploy, abra `/api/health`: a resposta deve informar `ok: true` e `storage: "postgresql"`. Abra o site em dois dispositivos e confirme que um cadastro criado no primeiro aparece automaticamente no segundo em até cinco segundos, com a página visível. Não é necessário atualizar manualmente.

Documentação oficial: [Netlify Database — configuração manual](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/), [migrações](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/).

## Executar localmente

Requer Node.js 22 ou superior:

```sh
npm ci
npm run dev
```

Abra `http://localhost:8888`. O servidor local utiliza **PGlite**, um PostgreSQL embutido em WebAssembly, e salva em `.local-data/`. Ele usa a mesma migração, validação e regras da API de produção, sem exigir instalação de PostgreSQL. Esse diretório é apenas local, não deve ser enviado ao GitHub ou Netlify.

O `npm run build` gera a interface em `dist/`. As funções são empacotadas pelo Netlify durante o deploy. Não é necessário PHP ou Python; o servidor usa JavaScript no runtime Node.js das Functions.

## Funcionalidades

- Cadastros de transportadoras, motoristas e veículos, com pesquisa, edição, inativação e reativação. Exclusão disponível para registros sem vínculos.
- Novos nomes e placas são cadastrados automaticamente ao confirmar um empréstimo. Selecionar motorista ou veículo pode preencher a transportadora vinculada.
- Empréstimo com múltiplos EPIs, verificação de disponibilidade e vínculo por atendimento.
- Devolução total ou parcial, registro de perdas/danos e identificação do funcionário responsável.
- Cadastro de EPI, contagem inicial, entradas, baixas avulsas, mínimo, edição e arquivamento.
- Painel com disponibilidade e pendências, filtros e relatórios por período, exportação CSV, Excel XML `.xls` e impressão para PDF.
- Preferências de unidade e funcionário padrão, salvas no banco compartilhado.
- Backup JSON completo e restauração dos formatos atual e anterior.
- Atualização automática a cada cinco segundos, preservando os campos em preenchimento. Durante uma janela de edição aberta, alterações recebidas aguardam seu fechamento. Alertas aparecem somente em falhas; bloqueio de duplo envio e conflitos continuam ativos.
- WhatsApp opcional no cadastro do motorista e no novo empréstimo, com preenchimento automático e link para abrir a conversa. Nenhuma mensagem é enviada automaticamente.
- Layout responsivo, foco nos diálogos e operação por teclado.

Os estoques iniciais estão zerados. Informe a contagem real antes do primeiro empréstimo.

## Banco e integridade

O banco contém `epi_state` (estado operacional completo, em JSONB, com revisão), `epi_audit` (revisões, identificador de requisição, resumo e hash) e views de consulta `epi_stock`, `epi_loans`, `epi_carriers`, `epi_drivers`, `epi_vehicles`.

O agregado versionado permite gravar estoque, empréstimos, devoluções e cadastros na **mesma transação**. O servidor valida os registros, os saldos, os vínculos e o histórico de devoluções; bloqueia alterações com revisão desatualizada; usa bloqueio de linha e idempotência para repetição de requisições. O log técnico é gravado na mesma transação. Não há gravação de dados operacionais no GitHub, nem dependência do armazenamento do navegador.

Esta versão recebe estados de até **3 MB**, com no máximo **15 mil linhas de empréstimo** e **500 tipos de EPI**. Para volumes maiores, planeje paginação e endpoints por entidade. O histórico de auditoria registra resumos, não cópias restauráveis de cada revisão. Use backup JSON e os recursos de recuperação do provedor de banco.

O sistema permanece **sem autenticação**, conforme solicitado. Qualquer pessoa com acesso ao endereço pode consultar e alterar os registros, inclusive restaurar backups. A verificação de origem ajuda a impedir requisições indevidas de outras páginas, mas não substitui autenticação. Não publique tokens, credenciais ou dados reais no repositório público.

## Migrar os dados do HTML antigo

1. Abra o HTML antigo no navegador onde os dados foram registrados.
2. Baixe o backup JSON.
3. No site novo, abra **Backup e dados** e importe o arquivo.
4. A restauração substitui a base compartilhada após confirmação. Faça um backup da base atual antes.

Cadastros são gerados a partir dos empréstimos antigos quando necessário. Renomear um cadastro mantém o texto histórico dos empréstimos anteriores. Backups com saldo negativo ou devoluções inconsistentes são rejeitados para conferência.

## Usar PostgreSQL externo (opcional)

Configure `DATABASE_URL` apenas no ambiente das Functions, execute `npm run db:migrate` no ambiente autorizado e publique. A conexão deve usar TLS conforme o provedor. O caminho recomendado é o Netlify Database, com migração automática. O arquivo `.env.example` é apenas um modelo; segredos não fazem parte do código.

## Verificação

```sh
npm test
npm run build
```

Os testes de API usam PostgreSQL em memória e verificam concorrência, devolução parcial com perda, estoque insuficiente, idempotência, cadastros inativos, validação de requisições, restauração e rollback transacional.

Para testar a interface, utilize uma base local vazia e execute, em dois terminais:

```sh
npm run dev
```

```sh
npx playwright install chromium
npm run test:browser
```

O teste de navegador cria dados temporários na base local, exige que ela esteja sem empréstimos e limpa os dados ao terminar. Pode-se definir `LOCAL_DATA_DIR` no servidor para usar um diretório exclusivo de teste. `CHROME_PATH` permite selecionar um Chrome já instalado. Os testes não aceitam URL de produção.

Também foi executado `netlify build --offline` para verificar o empacotamento das Functions. A publicação, o provisionamento do banco remoto e as condições do plano só podem ser conferidos depois de criar o site no Netlify.

## Estrutura

```text
public/                  interface: HTML, CSS, JavaScript e imagem incorporada ao projeto
server/                  API, validação, persistência e servidor local
netlify/functions/       entrada da API no Netlify
netlify/database/         migração SQL
scripts/                 build e migração manual
tests/                   API e navegador
netlify.toml             publicação e roteamento
package-lock.json        versões reproduzíveis
```

Crédito original preservado: Aguinaldo Fernando de Jesus — Analista Fiscal.
