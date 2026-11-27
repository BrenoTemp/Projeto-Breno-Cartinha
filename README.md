# Cartinhas do Breno

Um site acolhedor de cartas pessoais protegidas por senha individual, com área administrativa exclusiva protegida por senha aleatória para que apenas o Breno possa adicionar, visualizar, editar ou excluir cartinhas.

## Funcionalidades

- **Aba Cartinhas (pública)**: exibe a lista de nomes em envelopes lacrados, com busca (sem distinção de acentos) e ordenação. Quem visita só consegue abrir a própria carta informando a senha individual dela.
- **Aba Admin (restrita ao Breno)**: protegida por uma senha aleatória de administrador. Somente autenticado no painel é possível adicionar novas cartinhas, escolher/visualizar qualquer carta, editar nome/texto/lacre/senha individual ou excluir cartinhas — além de poder alterar a senha do próprio admin.
- **Segurança no servidor**:
  - As senhas individuais e a senha do admin são salvas apenas como hash (`scrypt` + salt aleatório), nunca em texto puro.
  - A lista pública (`GET /api/cartas`) nunca envia o conteúdo das cartas nem hashes de senha.
  - As rotas de criação, edição e exclusão (`/api/admin/cartas`) exigem autenticação de administrador no servidor.
- **Persistência em arquivo**: os dados ficam salvos em `data/cartas.json` e `data/admin.json`, sem necessidade de banco externo ou dependências extras.

## Como rodar

Não há dependências externas — basta ter Node.js 18+ instalado:

```bash
npm start
```

Na primeira execução, o servidor gera automaticamente uma senha aleatória de administrador (formato `BRN-XXXX-XXXX`), exibe no terminal uma única vez e salva apenas o hash em `data/admin.json`. Caso queira redefinir a senha inicial no futuro, basta apagar `data/admin.json` e reiniciar o servidor (ou definir a variável de ambiente `ADMIN_PASSWORD`).

## Estrutura

- `server.js` — servidor HTTP e API REST pública (`/api/cartas`) e administrativa (`/api/admin/*`).
- `data/cartas.json` — armazenamento persistente das cartinhas.
- `data/admin.json` — hash da senha do administrador.
- `public/index.html`, `public/styles.css`, `public/app.js` — interface do site com abas `Cartinhas` e `Admin`.
