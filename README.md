# Estudos UFF / Estudos UFVJM 💙

O mesmo app em duas versões, cada uma com seu ícone, nome e **dados separados**:

| Versão | Link | Ícone na Tela de Início |
|---|---|---|
| **UFF** | https://livianerymai-jpg.github.io/Livi/ | brasão da UFF |
| **UFVJM** | https://livianerymai-jpg.github.io/Livi/ufvjm/ | logo da UFVJM |

Para instalar: abra o link da versão no **Safari** → Compartilhar → **Adicionar à Tela de Início**. Dá para ter as duas instaladas ao mesmo tempo.

App de estudos para iPhone (instalável pela Tela de Início, funciona offline), com:

| Aba | O que faz |
|---|---|
| **Hoje** | Contagem regressiva, semana com as tarefas de cada dia, **deslize → para concluir e ← para adiar**, aulas do dia para marcar presença. O que ficar para trás é **reagendado sozinho** |
| **Estudos** | Painel de disciplinas. Em cada uma: **dificuldade 1–5**, **dias da semana em que você estuda a matéria**, **espaçamento das revisões** e as avaliações (prova, trabalho, seminário…) com a **lista de conteúdos** → plano com **revisões espaçadas** e **folga antes da prova**. Tudo editável: mudar datas, desprogramar, revisão extra, **associar conteúdos** (estudar juntos), mover entre avaliações |
| **Agenda** | Hub de eventos **sincronizado nos dois sentidos com o Google Agenda**, calendário de provas e **horas complementares** (com certificado) |
| **Notas** | As avaliações cadastradas em Estudos **aparecem aqui sozinhas**. Cada disciplina com seu jeito de calcular: **com pesos**, **fórmula livre** ou **sistema modular** (módulos com avaliações em pontos, escala 0–10 ou 0–100, mínimo por módulo) |
| **Presença** | Presença/falta por aula, limite de faltas pelo mínimo de **75%** |

Seus dados ficam no iPhone e, se você conectar o Google, também num backup no seu Google Drive (pasta oculta do app).

---

## 1. Publicar o app (uma vez só)

O app precisa de um endereço `https://` para abrir no iPhone e para o login do Google.

1. **Settings → General → Danger Zone → Change visibility → Public** neste repositório. O GitHub Pages grátis só funciona em repositório público. Só o código fica visível; os seus dados nunca vão para o GitHub.
2. **Settings → Pages → Source: Deploy from a branch** → branch `claude/exercise-tracking-app-jdnd33` (ou `main` depois do merge), pasta `/ (root)` → **Save**.
3. Em 1–3 minutos o app estará em **https://livianerymai-jpg.github.io/Livi/**

## 2. Instalar no iPhone

1. Abra o link acima no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra pelo ícone azul **Estudos UFF**. Use sempre pelo ícone (os dados ficam guardados nele).

Primeiros passos dentro do app:
1. **⚙️ Ajustes**: seu nome, datas do semestre, quantos dias de folga antes das provas e quantos blocos de estudo por dia.
2. **Estudos → + Disciplina** e escolha a dificuldade de 1 a 5.
3. Dentro da disciplina: **+ Prova** com a data e os conteúdos (um por linha). O plano aparece na hora e na aba **Hoje**.
4. **Presença**: em cada disciplina, marque os dias da semana de aula e a carga horária.
5. **Notas**: escolha o modelo (2 provas, 3 provas, provas + trabalho ou fórmula própria) e vá lançando as notas.

Quer ver tudo funcionando antes? **Ajustes → Carregar exemplo**.

## 3. Conectar o Google Agenda (uma vez, ~10 minutos, pelo computador)

O Google exige que cada app tenha uma “chave” própria. É grátis.

1. Acesse **https://console.cloud.google.com** com sua conta Google → **Selecionar projeto → Novo projeto** → nome `Estudos UFF` → **Criar**.
2. Menu **APIs e serviços → Biblioteca**: ative **Google Calendar API** e **Google Drive API**.
3. Menu **Google Auth Platform** (ou “Tela de consentimento OAuth”) → **Começar**:
   - Nome do app: `Estudos UFF`, e-mail de suporte: o seu.
   - Público: **Externo**.
   - Em **Público-alvo → Usuários de teste**, adicione **o seu e-mail**.
4. **Clientes → Criar cliente** → tipo **Aplicativo da Web**:
   - **Origens JavaScript autorizadas**: `https://livianerymai-jpg.github.io`
   - **URIs de redirecionamento autorizados**: `https://livianerymai-jpg.github.io/Livi/` e `https://livianerymai-jpg.github.io/Livi/ufvjm/`
   - **Criar** e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
5. No app: **Ajustes → ID do cliente OAuth** → cole → **Conectar com o Google**.
   - Vai aparecer “O Google não verificou este app”: toque em **Continuar** (o app é seu).
6. Recomendado: **+ Criar agenda “Faculdade UFF”** para provas e eventos ficarem numa agenda separada (aparece colorida no Google Agenda e no Calendário do iPhone, se a sua conta Google estiver lá).

Como funciona:
- O que você cria/edita/apaga no app vai para o Google, e o que está no Google aparece no app (ao abrir o app e ao tocar em ↻).
- Provas viram eventos “📝 Prova: …”. Se você remarcar uma prova no Google, o app avisa e oferece replanejar.
- Por segurança, o Google pede para reconectar a cada ~1 hora de uso. É só tocar em **Conectar** (sem senha).
- Se a janela de login não abrir no iPhone: **Ajustes → Modo de login → Redirecionar**.

## 4. Como o plano de estudos é montado

- **Estudo** do conteúdo → **revisões** em intervalos crescentes (padrão: 1, 2, 4 e 7 dias entre uma sessão e a próxima — você escolhe Curto, Padrão, Longo ou digita os seus). É o *efeito de espaçamento*, uma das técnicas com mais evidência para memória de longo prazo (Ebbinghaus; Cepeda et al., 2006/2008).
- Revisar = **tentar lembrar** (questões, flashcards, explicar em voz alta), não só reler (*prática de recuperação*, Roediger & Karpicke, 2006).
- A 1ª revisão fica no dia seguinte, depois de uma noite de sono (consolidação).
- Matérias com dificuldade maior começam antes (e, no espaçamento automático, ganham mais revisões).
- Se a matéria tem **dia fixo** (ex.: só terça), estudos e revisões caem só nesse dia.
- Datas que você muda à mão ficam fixas (📌); revisões que você desprograma não voltam (a não ser que você restaure); conteúdos **associados** são estudados e revisados juntos.
- Uma **revisão final** fica logo antes da **folga** (padrão: 2 dias livres antes de cada prova). Nos dias de folga de uma prova, as outras matérias ficam com metade da carga.
- O plano respeita sua capacidade diária e os dias sem estudo. O que você não fizer é reagendado sozinho no dia seguinte (dá para desligar em Ajustes).

## Desenvolvimento

Sem build: HTML, CSS e JavaScript puro. A versão UFVJM (`ufvjm/`) usa o mesmo código; depois de mudar `index.html` ou `manifest.webmanifest`, rode `python3 tools/make-variants.py`.

```sh
npm start   # http://localhost:8080
npm test    # testes do planejador, notas e presença
```
