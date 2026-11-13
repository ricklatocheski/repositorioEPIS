# Publicação no Netlify

1. Entre no Netlify e escolha **Add new project → Import an existing project**.
2. Selecione **GitHub** e autorize o acesso ao repositório **ricklatocheski/repositorioEPIS**.
3. Selecione a branch **main**. A configuração já está no arquivo `netlify.toml`.
4. Confira **Build command: `npm run build`** e **Publish directory: `dist`**.
5. Publique. O projeto está preparado para provisionar o Netlify Database e aplicar a migração SQL no deploy. Se solicitado, confira/ative em **Data & Storage → Database**, observando as condições e o consumo do plano.
6. Depois da publicação, acesse `https://SEU-SITE.netlify.app/api/health`. Deve aparecer `"ok":true`.
7. Abra o sistema em dois dispositivos, cadastre uma transportadora e aguarde até cinco segundos no segundo, com a página visível, para conferir a atualização automática.

**Não arraste somente o ZIP para o Netlify Drop.** Isso entrega a parte estática sem executar o build necessário à API e ao banco. O caminho completo é a importação pelo GitHub.

O ZIP contém o código-fonte completo. Se precisar reenviar os arquivos ao GitHub, extraia a pasta e envie seu conteúdo para a raiz do repositório, incluindo `package.json`, `package-lock.json`, `public`, `server`, `netlify`, `scripts` e `netlify.toml`.

O sistema não tem página de login. Quem acessar o endereço pode operar a base. A contagem inicial dos EPIs deve ser informada no menu **Estoque de EPIs**.
