# Deploy no Render.com

## Configuração Rápida

### 1. Criar novo Static Site no Render

1. Acesse [render.com](https://render.com) e faça login
2. Clique em **New** → **Static Site**
3. Conecte seu repositório GitHub
4. Configure:
   - **Name**: `vibe-drinks` (ou seu nome preferido)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

### 2. Variáveis de Ambiente

No painel do Render, vá em **Environment** e adicione:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `VITE_SUPABASE_URL` | `https://owasvhnvalnzqeiuklnu.supabase.co` | URL do Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOiJIUzI1...` | Chave pública do Supabase |
| `VITE_SUPABASE_PROJECT_ID` | `owasvhnvalnzqeiuklnu` | ID do projeto |
| `VITE_GOOGLE_MAPS_KEY` | (sua chave) | Opcional - para mapas |

### 3. Configurar SPA Routing

Para que as rotas do React funcionem, adicione uma **Rewrite Rule**:

1. Vá em **Redirects/Rewrites**
2. Adicione:
   - **Source**: `/*`
   - **Destination**: `/index.html`
   - **Action**: `Rewrite`

### 4. Domínio Personalizado

1. No painel do Render, vá em **Settings** → **Custom Domains**
2. Clique em **Add Custom Domain**
3. Digite seu domínio (ex: `vibedrinks.com.br`)
4. Configure o DNS no seu provedor:

#### Para domínio raiz (vibedrinks.com.br):
```
Tipo: A
Nome: @
Valor: (IP fornecido pelo Render)
```

#### Para subdomínio www:
```
Tipo: CNAME
Nome: www
Valor: vibe-drinks.onrender.com (seu subdomínio Render)
```

### 5. SSL/HTTPS

O Render configura SSL automaticamente após verificar o domínio (pode levar alguns minutos).

---

## Checklist de Deploy

- [ ] Repositório conectado ao Render
- [ ] Build command configurado: `npm install && npm run build`
- [ ] Publish directory: `dist`
- [ ] Variáveis de ambiente configuradas
- [ ] Rewrite rule para SPA configurada
- [ ] Domínio personalizado adicionado
- [ ] DNS configurado no provedor
- [ ] SSL ativo (verificar HTTPS)

---

## Troubleshooting

### Build falhou
- Verifique se todas as variáveis `VITE_*` estão configuradas
- Confira os logs de build no Render

### Página em branco ou 404
- Verifique se o rewrite `/* → /index.html` está configurado
- Confirme que o publish directory é `dist`

### API não funciona
- Verifique se `VITE_SUPABASE_URL` está correto
- Confirme que as Edge Functions estão deployadas no Supabase

### Domínio não funciona
- Aguarde propagação DNS (até 48h)
- Verifique configuração no [DNS Checker](https://dnschecker.org)
- Confirme que o SSL foi provisionado

---

## Comandos Úteis

```bash
# Build local para teste
npm run build

# Preview do build
npm run preview

# Verificar erros de TypeScript
npx tsc --noEmit
```

---

## Estrutura de Deploy

```
/
├── dist/                 # Build output (Publish Directory)
│   ├── index.html
│   ├── assets/
│   └── ...
├── render.yaml           # Blueprint (opcional)
├── public/_redirects     # Fallback SPA
└── DEPLOY.md            # Este arquivo
```
