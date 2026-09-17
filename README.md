# Dark Cupid — versão com segurança e privacidade

## Rodar no VS Code
1. Instale Node.js LTS.
2. Abra esta pasta no VS Code.
3. No terminal execute `npm install`.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

## Recursos
- Cadastro/login com bcrypt e JWT.
- Confirmação de 18 anos no cadastro.
- Perfil com foto e bio.
- Mural com fotos.
- Conexões.
- Chat em tempo real com texto e imagens.
- Limite de imagem de 5 MB.
- Bloqueio e desbloqueio.
- Denúncia de usuários.
- Controles de privacidade do perfil e das mensagens.
- Usuários bloqueados deixam de aparecer na lista.
- Conversas ficam indisponíveis quando existe bloqueio.
- Denúncias ficam registradas no `data/db.json` para revisão/moderação.
- Mensagens denunciadas acumulam sinalizações; após múltiplas denúncias, podem ser ocultadas automaticamente.

## Pastas
- `data/db.json`: dados da aplicação.
- `uploads/`: imagens enviadas.
- `public/`: interface.

## Importante para produção
Esta versão implementa controles básicos de segurança, mas uma plataforma pública precisa de moderação humana, armazenamento seguro, HTTPS, segredo JWT em variável de ambiente, proteção contra abuso/rate limiting, política de privacidade, termos de uso e um sistema de revisão de denúncias.

## Área do dono
A área do dono fica em "Área do dono" na tela inicial. Por padrão:
- Usuário: `dono_darkcupid`
- Senha: `DarkCupidDono#2026`

Para produção, troque essas credenciais pelas variáveis `DARK_CUPID_OWNER_USER` e `DARK_CUPID_OWNER_PASSWORD`.

O banco inicial desta versão foi zerado. Denúncias ficam registradas para o dono. A partir da área do dono é possível apagar uma conta ou bloqueá-la por 7 dias.
