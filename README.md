# Controle de EPIs · Balança

Sistema sem página de login, com interface inspirada no catálogo Guararapes enviado pelo solicitante. Inclui cadastros reutilizáveis, empréstimos com múltiplos EPIs, devoluções parciais, perdas, estoque e relatórios.

### Layout e tela de entrada 2.6

Revisão visual baseada no painel de erros de lançamento indicado pelo solicitante: fonte Manrope hospedada no próprio projeto, ícones vetoriais, cartões de indicadores, blocos de disponibilidade e movimentação, pendências agrupadas por empréstimo e formulário de empréstimo com lateral em textura de madeira, sem frases ou etapas nessa lateral. A navegação acompanha a tela atual e se adapta a desktop, tablet e celular. A busca e os atalhos do painel abrem os registros já filtrados.

O gráfico distribui as unidades dos empréstimos entre em circulação, devolvidas e baixadas; representa movimentações, não equipamentos físicos únicos. Os indicadores operacionais e o estoque continuam baseados na mesma base compartilhada. Nenhuma migração de dados é necessária para essa revisão visual. A fonte Manrope acompanha sua licença OFL em `public/assets/Manrope-OFL.txt`.

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

## Entrada no sistema

Ao acessar ou recarregar o site, o formulário de novo empréstimo abre automaticamente sobre o painel após a conexão com o banco. Ele reúne motorista, transportadora, placa, WhatsApp, EPIs, quantidades, funcionário da balança, data e observações. Feche pelo X, pela tecla Escape ou pelo fundo para consultar o painel; o preenchimento em andamento é preservado ao reabrir. O botão Novo empréstimo abre a mesma janela. A confirmação salva a entrega e abre os empréstimos registrados. Não há menus de Backup e dados ou Preferências.

## Funcionalidades

- Cadastros de transportadoras, motoristas e veículos, com pesquisa, edição, inativação e reativação. Exclusão disponível para registros sem vínculos.
- Novos nomes e placas são cadastrados automaticamente ao confirmar um empréstimo. Selecionar motorista ou veículo pode preencher a transportadora vinculada.
- Empréstimo com múltiplos EPIs, verificação de disponibilidade e vínculo entre os itens.
- Devolução total ou parcial com identificação do funcionário responsável.
- Registro separado de perda pela portaria: EPI e quantidade, responsável, data e relato obrigatório. A ocorrência recebe protocolo e fica vinculada ao empréstimo. Ela encerra apenas a quantidade perdida, sem aumentar o disponível. Os relatos podem ser consultados em Empréstimos e devoluções.
- Estoque simplificado: EPI, quantidade disponível e ações. Informe a quantidade que está fisicamente disponível; o sistema ajusta o saldo sem apagar empréstimos ou devoluções.
- Painel com disponibilidade e pendências, filtros e relatórios por período, exportação CSV, Excel XML `.xls` e impressão para PDF.
- Atualização automática a cada cinco segundos, preservando os campos em preenchimento. Durante uma janela de edição aberta, alterações recebidas aguardam seu fechamento. Alertas aparecem somente em falhas; bloqueio de duplo envio e conflitos continuam ativos.
- WhatsApp opcional no cadastro do motorista e no novo empréstimo, com máscara de DDD e número, por exemplo `(42) 99999-9999`. O DDD 42 é um exemplo; outros DDDs também são aceitos. O código +55 é acrescentado aos números brasileiros para abrir a conversa. Há preenchimento automático e link; nenhuma mensagem é enviada automaticamente.
- Layout responsivo, foco nos diálogos e operação por teclado.

Os estoques começam zerados. Informe a quantidade disponível real antes do primeiro empréstimo. Exemplo: 10 disponíveis − 2 emprestados = 8 disponíveis; com a devolução dos 2, o disponível volta a 10. Perdas não retornam ao disponível. A edição do disponível não altera a quantidade já emprestada.

## Banco e integridade

O banco contém `epi_state` (estado operacional completo, em JSONB, com revisão), `epi_audit` (revisões, identificador de requisição, resumo e hash) e views de consulta `epi_stock`, `epi_loans`, `epi_carriers`, `epi_drivers`, `epi_vehicles`.

O agregado versionado permite gravar estoque, empréstimos, devoluções e cadastros na **mesma transação**. O servidor valida os registros, os saldos, os vínculos e o histórico de devoluções; bloqueia alterações com revisão desatualizada; usa bloqueio de linha e idempotência para repetição de requisições. O log técnico é gravado na mesma transação. Não há gravação de dados operacionais no GitHub, nem dependência do armazenamento do navegador.

Esta versão recebe estados de até **3 MB**, com no máximo **15 mil linhas de empréstimo** e **500 tipos de EPI**. Para volumes maiores, planeje paginação e endpoints por entidade. O histórico de auditoria registra resumos, não cópias restauráveis de cada revisão. Use os recursos de recuperação do provedor de banco.

O sistema permanece **sem autenticação**, conforme solicitado. Qualquer pessoa com acesso ao endereço pode consultar e alterar os registros, inclusive por chamadas diretas à API. A verificação de origem ajuda a impedir requisições indevidas de outras páginas, mas não substitui autenticação. Não publique tokens, credenciais ou dados reais no repositório público.

## Perdas e EPIs ainda com o motorista

Enquanto não for devolvido nem tiver perda confirmada, o EPI continua pendente e indisponível. Use **Registrar perda** no empréstimo apenas quando a portaria confirmar a perda. Informe quem registrou, quando, a quantidade e o relato. O sistema exige ao menos dez caracteres no relato e não permite registrar quantidade superior à pendente. **Devolver itens** é utilizado somente para itens recebidos de volta.

Exemplo: de 10 capacetes, 3 foram emprestados e restam 7 disponíveis. Se 1 desses 3 for perdido, continuam 7 disponíveis e 2 pendentes. Quando os 2 forem devolvidos, o disponível será 9; a unidade perdida não voltou.

Os relatos ficam em **Empréstimos e devoluções → Relatos de perda ou dano** e aparecem no histórico exportado pelos relatórios. Registros antigos de perda/dano continuam visíveis. Novas perdas exigem relato e identificação; o histórico registrado não pode ser reescrito pela edição comum.

## Dados existentes

A revisão 2.6 não altera a estrutura do banco nem apaga os registros existentes. A importação de bases antigas e a recuperação de dados são procedimentos técnicos; não há uma área de backup na interface. Renomear um cadastro continua preservando o texto histórico dos empréstimos anteriores.

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

A identificação interna de agrupamento não é exibida nas telas, avisos ou relatórios. Os itens do mesmo empréstimo continuam vinculados para devolução e registro de perda.
