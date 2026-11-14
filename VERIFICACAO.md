# Verificação da entrega

Validação atualizada em 14/11/2026:

- 12 testes automatizados da API aprovados, usando PostgreSQL em memória via PGlite, incluindo persistência e validação do WhatsApp.
- Fluxo no Chrome aprovado: cadastros, vínculo de transportadora, estoque inicial, empréstimo, devolução parcial com perda, edição sem recriar cadastro antigo e persistência após recarregar.
- Dois contextos de navegador independentes consultaram a mesma base pela API. As alterações foram recebidas automaticamente, preservando um formulário em preenchimento. Uma gravação com revisão desatualizada foi rejeitada sem apagar a atualização anterior e os dados foram recarregados automaticamente.
- Falha de conexão recusou a gravação, sem emitir confirmação de sucesso, e o sistema retomou a atualização automaticamente quando a rede voltou.
- Textos de conexão/revisão, identificação no canto superior direito, legenda do menu, bloco inferior da barra lateral, rodapé de autoria e banner promocional removidos conforme solicitado.
- Restauração técnica verificada nos testes da API; exportação CSV e impressão para PDF verificadas no navegador.
- Todas as telas verificadas em largura móvel de 390 px, sem transbordamento horizontal da página.
- Revisão visual 2.4 conferida nas seis telas em larguras de 390, 768, 1024 e 1440 px; busca, atalhos para pendências, fonte e formulário de empréstimo também verificados.
- Abertura automática do formulário após conectar ao banco; campos, fechamento pelo X e Escape, preservação do rascunho, foco dentro da janela e recuperação da conexão verificados. Menus de Backup e dados e Preferências removidos.
- `npm run build` aprovado.
- `netlify build --offline` aprovou build e empacotamento da Function `api.mjs`.
- `npm audit --omit=dev --audit-level=high`: nenhuma vulnerabilidade encontrada.

Não foi criado ou publicado um site no Netlify, conforme a escolha de receber o pacote e fazer a publicação. O banco remoto será provisionado na conta do Netlify durante a publicação, sujeito à compatibilidade e às condições do plano. A execução em produção ainda precisa ser conferida após esse deploy.

O pacote não contém dados operacionais, credenciais, `node_modules` nem a base usada nos testes.

Revisão 2.4: estoque reduzido a EPI, disponível e ações. A edição da quantidade disponível, para mais e para menos, preservou o empréstimo em aberto e as devoluções já registradas. WhatsApp recebeu máscara de DDD e número, com 42 como exemplo.
