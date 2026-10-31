# Apps: Windows, Linux, Android e iOS

Os apps são uma "casca" em volta do site. A interface é a mesma do navegador e vem direto de
https://simplecall.antonioinaciodev.workers.dev, então **todo deploy do site já atualiza os apps**,
sem ninguém precisar baixar de novo. Só é preciso gerar instaladores novos quando muda algo
da parte nativa (pastas `apps/desktop` e `apps/mobile`).

| | Pasta | Tecnologia | O que o app faz além do site |
| --- | --- | --- | --- |
| Windows e Linux | `apps/desktop` | Electron | Seletor próprio de tela ou janela; manda só o áudio do jogo, sem as vozes da call; a call não engasga com a janela minimizada |
| Android | `apps/mobile/android` | Capacitor | Escolher alto-falante, ouvido ou fone; mic continua funcionando com o app em segundo plano (notificação "Na call") |
| iOS | `apps/mobile/ios` | Capacitor | Escolher alto-falante, ouvido ou fone; som continua em segundo plano |

## Baixar e instalar

Os instaladores ficam nas [Releases](https://github.com/antonioinaciodev/simple-call/releases/latest):

- **Windows:** `SimpleCall-Windows.exe`. Instala sem pedir administrador. Como o instalador não tem
  certificado (custa caro), o Windows pode mostrar "O Windows protegeu o computador": clique em
  **Mais informações → Executar assim mesmo**.
- **Linux:** `SimpleCall-Linux.AppImage` (qualquer distro: dê permissão de execução e abra) ou
  `SimpleCall-Linux.deb` (Ubuntu, Mint, Debian: `sudo apt install ./SimpleCall-Linux.deb`).
- **Android:** `SimpleCall-Android.apk`. Abra no celular e permita "instalar apps desconhecidos"
  pro navegador ou gerenciador de arquivos.
- **iOS:** veja [iOS](#ios) abaixo.

## Gerar uma Release

O workflow [`.github/workflows/apps.yml`](../.github/workflows/apps.yml) gera tudo no GitHub Actions
(Windows, Linux, Android e iOS rodam em máquinas da GitHub, de graça em repositório público).

1. Faça o merge do que quiser no `main`.
2. Crie uma tag de versão pelo terminal:
   ```bash
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```
   Ou pelo site: **Releases → Draft a new release → Choose a tag**, digite `v0.2.0`,
   **Create new tag** e **Publish release**.
3. Em uns 10 minutos a Release `v0.2.0` fica com os instaladores e uma tabela de downloads.

Em todo PR que mexe em `apps/desktop` ou `apps/mobile`, o mesmo workflow roda e deixa os arquivos
pra teste em **Actions → (a execução) → Artifacts**, sem publicar nada.

### Chave do Android (uma vez só)

O Android só deixa instalar uma versão nova por cima da antiga se as duas forem assinadas com a
mesma chave. A chave fica nos segredos do repositório:

1. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Crie `ANDROID_KEYSTORE_BASE64` com o conteúdo do arquivo `simplecall.jks.base64.txt`.
3. Crie `ANDROID_KEYSTORE_PASSWORD` com a senha da chave.

Guarde o `simplecall.jks` e a senha num lugar seguro (um gerenciador de senhas, por exemplo). Se
perder, as próximas versões vão exigir desinstalar o app antes de instalar.

Sem esses segredos o workflow ainda gera um APK, mas assinado com uma chave temporária: serve pra
testar, mas cada versão vai pedir pra desinstalar a anterior.

## iOS

Duas limitações da Apple, que não dependem do código:

- **Compilar precisa de um Mac.** Isso o GitHub Actions resolve (o job roda num Mac da GitHub).
- **Instalar no iPhone precisa de assinatura.** Sem a conta paga da Apple (Apple Developer Program,
  US$ 99 por ano), o workflow gera `SimpleCall-iOS-sem-assinatura.ipa`, que dá pra instalar com o
  [Sideloadly](https://sideloadly.io) ou o [AltStore](https://altstore.io) usando um Apple ID comum.
  O app instalado assim para de abrir depois de 7 dias e precisa ser reinstalado.

Enquanto isso, no iPhone o site funciona no Safari (e dá pra "Adicionar à Tela de Início").
Com a conta paga, dá pra assinar no workflow e distribuir pelo TestFlight.

## Rodar os apps no seu PC

Tudo fica dentro da pasta do projeto, nada é instalado no sistema.

**Desktop** (o Electron, ~100 MB, só é baixado na primeira vez):

```bash
npx pnpm@10 --filter @simple-call/desktop start        # app apontando pro site no ar
npx pnpm@10 dev                                         # em outro terminal, se for testar mudanças do site...
npx pnpm@10 --filter @simple-call/desktop start:local  # ...e o app apontando pro localhost:5173
npx pnpm@10 --filter @simple-call/desktop dist         # gera o instalador do seu sistema em apps/desktop/release
```

No app: `F5` recarrega, `F11` tela cheia e `F12` abre as ferramentas de desenvolvedor.

**Android** precisa do [Android Studio](https://developer.android.com/studio) (ele traz o Java e o SDK):

```bash
npx pnpm@10 --filter @simple-call/mobile android   # sincroniza e abre o projeto no Android Studio
```

No Android Studio, ligue o celular com a depuração USB ativada e clique em ▶.

**iOS** só num Mac, com o Xcode: `npx pnpm@10 --filter @simple-call/mobile ios`.

## Como funciona por dentro

- **Desktop** (`apps/desktop/src`): `main.ts` abre uma janela com o site, deixa só o site do Simple
  Call rodar nela (outros links abrem no navegador) e mostra `offline.html` se a internet cair.
  `preload.ts` expõe pro site `window.simplecallDesktop` com `listSources()` (telas e janelas, só
  com o nome, pra abrir rápido) e `selectSource()`. O site mostra o próprio seletor e, quando chama
  `getDisplayMedia`, o app entrega a escolha (só a imagem).
- **Áudio só do jogo** (`apps/desktop/src/audio.ts`): o app captura o som à parte e manda pro site
  como PCM (float32, 2 canais, 48 kHz); o site toca isso num AudioWorklet e vira a faixa de áudio da
  transmissão (`apps/web/src/lib/desktopAudio.ts`).
  - **Windows:** `native/win-audio.cpp` vira `simplecall-audio.exe` (compilado no GitHub Actions) e
    usa o *process loopback* do WASAPI (Windows 10 2004 ou mais novo): "Só do jogo" pega o processo
    dono da janela escolhida; "PC inteiro" pega tudo menos o próprio Simple Call.
  - **Linux:** lista os apps tocando som com `pactl` e grava só o escolhido com
    `parec --monitor-stream` (funciona com PipeWire e PulseAudio). Precisa do pacote
    `pulseaudio-utils`, que já vem na maioria das distros.
- **Celular** (`apps/mobile`): o Capacitor abre o site num WebView. O plugin nativo `CallAudio`
  (`CallAudioPlugin.java` e `CallAudioPlugin.swift`) lista e troca a saída de áudio e, no Android,
  liga o `CallService` (serviço com notificação que o Android exige pra usar o mic em segundo plano).
  `www/index.html` é a tela de "sem conexão".
- **Site** (`apps/web/src/lib/native.ts`): detecta se está dentro de um app e usa essas pontes. No
  navegador nada muda. O `@capacitor/core` só é baixado dentro do app do celular.

## Limitações conhecidas

- **Áudio do jogo no Windows** precisa do Windows 10 versão 2004 (2020) ou mais novo.
- **Jogo que toca o som por outro programa** (alguns launchers): use "PC inteiro".
- **Rodando o app pelo código (`start`)** no Windows, a captura de áudio só funciona se você
  compilar `native/win-audio.cpp` (precisa do Visual Studio); no instalador ela já vem pronta.
- **Transmitir a tela pelo celular** não é possível no WebView; o botão nem aparece no celular.
- **macOS:** dá pra gerar, mas ficou de fora por enquanto (vocês usam Windows e Linux).
