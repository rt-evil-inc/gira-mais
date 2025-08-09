<p align="center">
  <img src="assets/icon.svg" width="190">
</p>

# Gira+
**Gira+** é uma re-implementação da aplicação Gira da Câmara Municipal de Lisboa/EMEL.
Com um olhar atento ao design, à experiência do utilizador (UX) e à estabilidade, este projeto visa proporcionar uma experiência de utilização mais agradável ao sistema de bicicletas partilhadas de Lisboa.

<p align="center">
  <img src="assets/screenshots/screenshot-1.png" width="200">
  <img src="assets/screenshots/screenshot-2.png" width="200">
  <img src="assets/screenshots/screenshot-3.png" width="200">
  <img src="assets/screenshots/screenshot-4.png" width="200">
</p>

### Funcionalidades extra
- Mapa com ciclovias
- Modo escuro
- Cálculo da distância percorrida e velocidade média durante uma viagem
- Vizualização do trajeto percorrido

### Não implementado
- Criação de contas
- Carregamento de saldo
- Compra de passes
- Histórico de passes e carregamentos
- Submissão de descrição na avaliação de viagem

### Desenvolvimento
A aplicação está a ser desenvolvida em **SvelteKit**, juntamente com a biblioteca **Capacitor** para compilar para Android.

## Instalação e Compilação

### Android

A aplicação está [disponível no Google Play](https://gira-mais.app/android), e será também brevemente disponibilizada no F-Droid.

É possível também descarregar o APK da versão mais recente da aplicação [aqui](https://github.com/rt-evil-inc/gira-mais/releases/latest).

Alternativamente, a aplicação pode ser compilada através dos seguintes passos:

1. Preparação:
 - Garantir que o Android SDK está instalado.
2. Configuração:
```bash
git clone git@github.com:rt-evil-inc/gira.git
cd gira
```
 - Criar um ficheiro `android/local.properties` com o caminho para o Android SDK, como no exemplo:
```properties
sdk.dir=/opt/android-sdk/
```
3. Compilação:
```sh
npm install
npm run build-app
```
  ou
```sh
bun install
bun run build-app
```

O ficheiro .apk será criado em `android/app/build/outputs/apk/debug/app-debug.apk`

### iOS

A aplicação está [disponível na App Store](https://gira-mais.app/ios).

Alternativamente, a aplicação pode ser compilada através dos seguintes passos:

1. Preparação:
 - Garantir que o Xcode está instalado.
 - Instalar Cocoapods, caso necessário: `brew install cocoapods`
2. Configuração:
```sh
git clone git@github.com:rt-evil-inc/gira.git
cd gira
```
3. Compilação:
```sh
npm install
npm run build
npx cap run ios
```
  ou
```bash
bun install
bun run build
bunx cap run ios
```

## Contribuição
Contribuições são bem-vindas! Consulte o ficheiro [`CONTRIBUTING.md`](CONTRIBUTING.md) para mais informações sobre como contribuir para o projeto.

## Licença
Este projeto está licenciado sob a licença [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html), com uma permissão adicional que concede aos contribuidores originais do projeto, Rodrigo e Tiago, o direito de disponibilizar o projeto sob qualquer licença adicional no futuro, sem remover a licença GPL v3 da versão atual do projeto. O intuito desta permissão adicional é possibilitar a utilização do código para fins que não sejam compatíveis com código open-source, desde que com autorização explícita dos contribuidores originais.

Consulte o ficheiro [LICENSE](LICENSE) para os termos completos.

## Misc
Cumprimentos ao [@afonsosousah](https://github.com/afonsosousah), que inspirou o projeto com a [mGira](https://github.com/afonsosousah/mgira).  
Obrigado ao [@joaodcp](https://github.com/joaodcp), que ajudou com esforços de *reverse engineering* do sistema original.  
Agradecimentos à Inês Freitas pelo design do logotipo da aplicação.