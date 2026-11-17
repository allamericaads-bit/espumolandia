# Casa Ensaboada 🫧

Jogo 3D no navegador: jogue sabonetes, espirre água com sabão e encha a casa de bolhas.
Tudo o que acerta a casa **fica salvo para todo mundo**, então quanto mais gente joga, mais espumada ela fica.
Tem ranking **do dia** e **de sempre** em três categorias: 🧼 sabonetes jogados, 💦 jatos d'água que acertaram e 🫧 pontos de espuma.

Feito com Three.js (via CDN). Não tem build: é um site estático mais uma função serverless (`api/soap.js`) para a Vercel.

## Como jogar

Você é um bonequinho na rua em frente à casa. O portão está aberto, dá para entrar no quintal.

| Ação | Computador | Celular |
|---|---|---|
| Andar / correr | `W A S D` ou setas · `Shift` corre | joystick (lado esquerdo) · empurre até o fim para correr |
| Mirar | mouse (o jogo prende o cursor; `Esc` solta) | arraste o dedo no lado direito |
| Jogar / atirar | clique ou segure o botão esquerdo (ou `F`) | botão grande à direita |
| Pular | espaço | botão ⤒ |
| Trocar arma | `1` sabonete · `2` pistola d'água · `3` bolhas | botões embaixo |
| Trocar sabonete | `Q` / `E` ou clique no sabonete | toque no sabonete |
| Aproximar a câmera | roda do mouse | — |

### Construir com espuma

A espuma é sólida. Jogue sabão (ou água com sabão) **em cima da espuma** e nasce uma bola de espuma nova
ali, então ela vai crescendo: dá para fazer torres, pontes e montanhas, e subir nelas pulando.
Tudo fica salvo para todo mundo, junto com o resto da casa. Quando você mira numa espuma, uma bolinha
transparente mostra onde a nova vai nascer. A espuma é fofa: cair nela faz quicar e pular de cima dela vai mais alto.
Cuidado com os sabonetes caídos no chão: correr em cima deles faz escorregar.

O ranking tem uma quarta categoria, **🏔️ Altura**: a maior altura em que você ficou em pé (a partir de 1,2 m).

O botão **Gráficos** (canto de baixo) alterna entre alto (com oclusão ambiental), médio e leve. Se o computador
estiver lento, o jogo baixa sozinho para o médio.

### Sabonetes

| Sabonete | Libera com | Efeito |
|---|---|---|
| Clássico (rosa) | já vem liberado | espuma cremosa rosinha |
| Glicerina (verde) | já vem liberado | quica 3 vezes, espumando a cada quique |
| Lavanda (roxo) | 5 sabonetes | estoura numa nuvem de bolhas que grudam na parede |
| Efervescente (laranja) | 15 sabonetes | se divide em 5 sabonetinhos no meio do ar |
| Arco-íris | 30 sabonetes | espuma colorida e confete de bolhas |
| Mega Sabão (azul, gigante) | 50 sabonetes | explosão enorme de espuma, a tela treme |

O **nível de espuma** da casa (barra no canto) soma os pontos de todos os jogadores. Conforme ele sobe, aparecem montes de espuma na base, no telhado e nas janelas, e a casa começa a soltar bolhas sozinha.

## Rodar no computador

Precisa só do Node 18 ou mais novo (não tem dependências):

```bash
npm run dev
```

Abra http://localhost:5173. O servidor local imita o banco de dados em memória, então o ranking e a casa compartilhada funcionam (os dados somem quando você fecha o servidor).

Se abrir o `index.html` sem a API, o jogo entra no **modo local**: salva só no próprio navegador e o ranking mostra só você.

## Publicar (GitHub + Vercel)

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório. Não precisa configurar framework nem comando de build (deixe "Other").
3. Crie o banco: no projeto da Vercel, vá em **Storage → Create Database → Upstash for Redis** (plano gratuito) e conecte ao projeto. Isso cria sozinho as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
   (Se você usar uma conta própria do Upstash, cadastre `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.)
4. Faça um novo deploy. Pronto: a casa e o ranking passam a ser compartilhados entre todo mundo.

### Lavar a casa (zerar a espuma)

Cadastre uma variável `ADMIN_KEY` na Vercel com uma senha sua e rode:

```bash
curl -X DELETE https://SEU-SITE.vercel.app/api/soap -H "x-admin-key: SUA_SENHA"
```

Isso apaga a espuma e o nível. Os rankings continuam.

## Ajustes rápidos

- `src/main.js` → `TARGET_SCORE`: quantos pontos de espuma enchem a casa (100%). Hoje é 20.000.
- `src/main.js` → `SOAPS`: cores, efeitos, tempo entre arremessos (`cd`) e quantos sabonetes liberam cada um (`unlock`).
- `api/soap.js` → `MAX_HITS`: quantas manchas de espuma a casa guarda (as mais antigas vão sumindo). `LIMITS`: limite por envio, para evitar trapaça.
- `src/house.js`: o modelo da casa (medidas em metros, a fachada fica em z = -6) e onde o bonequinho começa (`SPAWN`).
- `src/player.js`: velocidade, pulo e câmera do bonequinho.

## Estrutura

```
index.html        página + interface
style.css         visual da interface
src/main.js       jogo: armas, física, espuma, controles, interface
src/player.js     bonequinho, movimento e câmera em terceira pessoa
src/house.js      casa, rua, cerca, pérgola, vizinhos e vegetação
src/textures.js   texturas desenhadas por código (sem imagens)
src/audio.js      sons sintetizados (sem arquivos de áudio)
src/net.js        sincronização com a API e modo local
api/soap.js       função da Vercel: casa compartilhada + rankings (Upstash Redis)
dev-server.mjs    servidor local com Redis falso
```

## Observações

- Os rankings são por apelido e por navegador (um id aleatório salvo no aparelho). Não há login, então alguém mal-intencionado consegue inflar números; o servidor limita quanto cada envio pode somar.
- O dia do ranking "Hoje" vira à meia-noite no horário de Brasília.
