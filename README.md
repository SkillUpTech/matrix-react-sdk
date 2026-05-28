# matrix-react-sdk

## Enquadramento da Componente

O `matrix-react-sdk` é o SDK React para cliente Matrix utilizado na plataforma **DGEChat** da Direção-Geral da Educação (DGE). Trata-se de um fork do [`matrix-org/matrix-react-sdk`](https://github.com/matrix-org/matrix-react-sdk) v3.76.0, com customizações específicas para a DGE (ex.: remoção de funcionalidades de voz e localização geográfica).

Este repositório situa-se na camada de **interface de utilizador web** da plataforma DGEChat, fornecendo os componentes React que implementam a maior parte da lógica da aplicação de chat. É consumido por `element-web` (a "skin" web do DGEChat) e constitui o principal local de desenvolvimento do cliente.

**Hierarquia de repositórios DGEChat:**

```text
dgechat-desktop  (ponto de entrada recomendado — Web e Desktop)
|-- element-desktop  (wrapper Electron)
|-- element-web      ("skin" para matrix-react-sdk)
|-- matrix-react-sdk <-- este repositório (desenvolvimento principal)
`-- matrix-js-sdk    (SDK Matrix cliente JavaScript)
```

**Modificações DGE face ao upstream:**

- Ocultação das funcionalidades de voz (VoIP) e localização geográfica

**Identificação EA:** Componente de interface web do DGEChat — camada de cliente Matrix (LMS chat/messaging).

## Pré-requisitos

| Dependência | Versão / Detalhe |
| --- | --- |
| Node.js | LTS mais recente |
| Yarn | 1.x (não migrado para Yarn 2 — verificar `yarn --version`) |
| matrix-js-sdk | 27.0.0 (linked localmente via `yarn link` para desenvolvimento) |

Não são necessárias variáveis de ambiente para o SDK em si. Configurações de runtime (temas, módulos) são fornecidas pelo skin (`element-web`).

## Instalação e Execução Local

Este SDK não é executado em isolamento — requer uma skin (`element-web` / `dgechat-desktop`). Para desenvolvimento local do SDK:

### 1. Configurar matrix-js-sdk (dependência local)

```bash
git clone https://github.com/DGEChat/matrix-js-sdk
cd matrix-js-sdk
git checkout develop
yarn link
yarn install
```

### 2. Configurar matrix-react-sdk

```bash
git clone https://github.com/DGEChat/matrix-react-sdk
cd matrix-react-sdk
git checkout develop
yarn link matrix-js-sdk
yarn install
```

### 3. Build da biblioteca

```bash
yarn build
# Artefacto gerado em: lib/
```

Consulte o repositório [dgechat-desktop](https://github.com/DGEChat/dgechat-desktop) para instruções de execução do cliente completo.

## Configuração

O SDK funciona no modelo **skin** — a skin consumidora (`element-web`) é responsável por:

- Implementações customizadas de componentes de apresentação
- CSS personalizado e recursos visuais
- A aplicação contenedora
- Zero ou mais módulos com funcionalidade não-UI

**Estrutura de temas:**

Os temas CSS residem em `res/themes/`. O prefixo de classes CSS base é `mx_`. Para adicionar um tema, criar os ficheiros correspondentes em `res/themes/<nome>/` e registá-lo na skin.

**SonarQube:**

O ficheiro `sonar-project.properties` configura a análise de qualidade de código com as seguintes definições:

| Parâmetro | Valor |
| --- | --- |
| `sonar.sources` | `src,res` |
| `sonar.tests` | `test,cypress` |
| `sonar.typescript.tsconfigPath` | `./tsconfig.json` |
| `sonar.javascript.lcov.reportPaths` | `coverage/lcov.info` |

## Testes

```bash
# Testes unitários (Jest)
yarn test

# Testes unitários com cobertura
yarn coverage

# Verificação de tipos e linting
yarn lint

# Testes E2E Cypress (requer element-web em execução em yarn start)
yarn run test:cypress

# Abrir interface interativa Cypress
yarn run test:cypress:open
```

**Cobertura:** O relatório de cobertura é gerado em `coverage/lcov.info` (LCOV) e `coverage/jest-sonar-report.xml` (SonarQube).

Se surgirem erros "Cannot find module" após `yarn install`:

```bash
yarn cache clean && yarn install --force
```

## Build e Deployment

O SDK é distribuído como biblioteca npm. O processo de build compila TypeScript/JSX com Babel e gera declarações de tipos.

```bash
# Build completo (limpa lib/, compila, gera tipos)
yarn build

# Build incremental (modo watch — para desenvolvimento)
yarn start:build

# Verificar código antes de PR
yarn lint && yarn test
```

**Artefacto gerado:** directório `lib/` (Babel output) + `git-revision.txt`.

**Publicação npm:** `yarn prepublishOnly` executa `yarn build` automaticamente antes de publicar.

O SDK não tem workflow de CI/CD autónomo para deployment — é integrado e publicado através do repositório `dgechat-desktop`.

## Estrutura do Repositório

```text
matrix-react-sdk/
├── src/                       # Código-fonte TypeScript/TSX principal
│   ├── components/            # Componentes React (views/ e structures/)
│   ├── i18n/strings/          # Ficheiros de tradução JSON
│   └── ...
├── res/
│   ├── css/                   # CSS por componente (PCSS)
│   └── themes/                # Temas CSS e recursos visuais
├── test/                      # Testes unitários Jest
├── cypress/                   # Testes E2E Cypress
├── lib/                       # Output do build (gerado, não versionado)
├── docs/                      # Documentação técnica
├── __mocks__/                 # Mocks para Jest
├── scripts/                   # Scripts utilitários (ex: make-react-component)
├── package.json               # Metadados e dependências npm
├── tsconfig.json              # Configuração TypeScript
├── jest.config.ts             # Configuração Jest
├── cypress.config.ts          # Configuração Cypress
├── babel.config.js            # Configuração Babel
└── sonar-project.properties   # Configuração SonarQube
```

**Convenções de componentes:**

- Nomes com UpperCamelCase (ex: `views/rooms/EventTile.tsx`)
- Hierarquia de dois níveis: tipo (`views/` ou `structures/`) + agrupamento funcional
- Cada componente tem o seu próprio ficheiro CSS com o mesmo nome
- Classes CSS prefixadas com `mx_`

## Contribuição e Governação do Código

**Workflow de branches:**

- Branch de desenvolvimento: `develop` — **todos os PRs devem ser submetidos contra `develop`**
- Branch estável: `master` — apenas para releases estáveis
- Pull requests obrigatórios; revisão necessária antes de merge

**Guias de contribuição e estilo de código:**

- Contribution guide: `CONTRIBUTING.md` (baseado no Element contribution guide)
- Code style: baseado no [Element code style](https://github.com/vector-im/element-web/blob/develop/code_style.md)
- Issues: reportar em https://github.com/vector-im/element-web/issues

**Antes de submeter PR:**

```bash
yarn lint && yarn test
```

## Documentação Complementar

- [dgechat-desktop](https://github.com/DGEChat/dgechat-desktop) — ponto de entrada recomendado para build completo
- [element-web (DGEChat fork)](https://github.com/DGEChat/element-web) — skin web
- [matrix-js-sdk (DGEChat fork)](https://github.com/DGEChat/matrix-js-sdk) — SDK JavaScript Matrix
- [Cypress E2E docs](docs/cypress.md) — documentação dos testes Cypress
- [matrix-org/matrix-react-sdk upstream](https://github.com/matrix-org/matrix-react-sdk) — repositório original

## Licenciamento e SBOM

**Licença:** Apache-2.0 — ver `LICENSE`.

| Nome | Versão | Fornecedor | Tipo de Licença | Tipo | purl |
| --- | --- | --- | --- | --- | --- |
| matrix-js-sdk | 27.0.0 | Matrix.org Foundation | Apache-2.0 | runtime | `pkg:npm/matrix-js-sdk@27.0.0` |
| react | 17.0.2 | Meta Platforms | MIT | runtime | `pkg:npm/react@17.0.2` |
| react-dom | 17.0.2 | Meta Platforms | MIT | runtime | `pkg:npm/react-dom@17.0.2` |
| @matrix-org/matrix-wysiwyg | ^2.3.0 | Matrix.org Foundation | Apache-2.0 | runtime | `pkg:npm/%40matrix-org/matrix-wysiwyg` |
| matrix-widget-api | ^1.4.0 | Matrix.org Foundation | Apache-2.0 | runtime | `pkg:npm/matrix-widget-api` |
| @sentry/browser | ^7.0.0 | Functional Software (Sentry) | MIT | runtime | `pkg:npm/%40sentry/browser` |
| maplibre-gl | ^2.0.0 | MapLibre contributors | BSD-2-Clause | runtime | `pkg:npm/maplibre-gl` |
| sanitize-html | 2.11.0 | Apostrophe Technologies | MIT | runtime | `pkg:npm/sanitize-html@2.11.0` |
| highlight.js | ^11.3.1 | highlight.js contributors | BSD-3-Clause | runtime | `pkg:npm/highlight.js` |
| katex | ^0.16.0 | Khan Academy | MIT | runtime | `pkg:npm/katex` |
| lodash | ^4.17.20 | OpenJS Foundation | MIT | runtime | `pkg:npm/lodash` |
| posthog-js | 1.63.3 | PostHog Inc. | MIT | runtime | `pkg:npm/posthog-js@1.63.3` |
| jest | (devDep) | OpenJS Foundation | MIT | dev (testes) | `pkg:npm/jest` |
| cypress | (devDep) | Cypress.io | MIT | dev (testes E2E) | `pkg:npm/cypress` |
| typescript | (devDep) | Microsoft | Apache-2.0 | dev (build) | `pkg:npm/typescript` |

## Segurança

- **Gestão de segredos:** O repositório não contém passwords, API keys, tokens, certificados privados ou connection strings reais.
- **Sanitização de HTML:** O SDK usa `sanitize-html` 2.11.0 para sanitizar conteúdo Matrix recebido, prevenindo XSS.
- **Funcionalidades desativadas na DGE:** As funcionalidades de voz (VoIP) e localização geográfica foram desativadas no fork DGE por decisão da equipa (commits `fix/lj-607`, `fix/ie-579`).
- **Reporte de vulnerabilidades:** Reportar por contacto directo com os responsáveis técnicos do projeto DGEChat/DGE.

## Versão Entregue e Correspondência com o EA em Produção

| Campo | Valor |
| --- | --- |
| Versão | 3.76.0 |
| Tag/Release | — |
| Commit hash | `f80a321` |
| Data de release | *(a preencher)* |
| Ambiente | — |

---

> Developer Documentation (original below)

---

## Warning: This information is only partially applicable to DGEChat, look here instead: https://github.com/DGEChat/dgechat-desktop

```text
dgechat-desktop (recommended starting point to build DGEChat for Web and Desktop)
|-- element-desktop (electron wrapper)
|-- element-web ("skin" for matrix-react-sdk)
|-- matrix-react-sdk <-- this repo (most of the development happens here)
`-- matrix-js-sdk (Matrix client js sdk)
```

## matrix-react-sdk (Developer Documentation)

This is a react-based SDK for inserting a Matrix chat/voip client into a web page.

This package provides the React components needed to build a Matrix web client
using React. It is not useable in isolation, and instead must be used from
a 'skin'. A skin provides:

-   Customised implementations of presentation components.
-   Custom CSS
-   The containing application
-   Zero or more 'modules' containing non-UI functionality

As of Aug 2018, the only skin that exists is
[`vector-im/element-web`](https://github.com/vector-im/element-web/); it and
`matrix-org/matrix-react-sdk` should effectively
be considered as a single project (for instance, matrix-react-sdk bugs
are currently filed against vector-im/element-web rather than this project).

## Translation Status

[![Translation status](https://translate.element.io/widgets/element-web/-/multi-auto.svg)](https://translate.element.io/engage/element-web/?utm_source=widget)

## Developer Guide

Platform Targets:

-   Chrome, Firefox and Safari.
-   WebRTC features (VoIP and Video calling) are only available in Chrome & Firefox.
-   Mobile Web is not currently a target platform - instead please use the native
    iOS ([matrix-ios-kit](https://github.com/matrix-org/matrix-ios-kit)) and Android
    ([matrix-android-sdk2](https://github.com/matrix-org/matrix-android-sdk2)) SDKs.

All code lands on the `develop` branch - `master` is only used for stable releases.
**Please file PRs against `develop`!!**

We use the same contribution guide as Element. Check it out here:
https://github.com/vector-im/element-web/blob/develop/CONTRIBUTING.md

Our code style is also the same as Element's:
https://github.com/vector-im/element-web/blob/develop/code_style.md

Code should be committed as follows:

-   All new components:
    https://github.com/matrix-org/matrix-react-sdk/tree/master/src/components
-   Element-specific components:
    https://github.com/vector-im/element-web/tree/master/src/components
    -   In practice, `matrix-react-sdk` is still evolving so fast that the
        maintenance burden of customising and overriding these components for
        Element can seriously impede development. So right now, there should be
        very few (if any) customisations for Element.
-   CSS: https://github.com/matrix-org/matrix-react-sdk/tree/master/res/css
-   Theme specific CSS & resources:
    https://github.com/matrix-org/matrix-react-sdk/tree/master/res/themes

React components in matrix-react-sdk come in two different flavours:
'structures' and 'views'. Structures are stateful components which handle the
more complicated business logic of the app, delegating their actual presentation
rendering to stateless 'view' components. For instance, the RoomView component
that orchestrates the act of visualising the contents of a given Matrix chat
room tracks lots of state for its child components which it passes into them for
visual rendering via props.

Good separation between the components is maintained by adopting various best
practices that anyone working with the SDK needs to be aware of and uphold:

-   Components are named with upper camel case (e.g. views/rooms/EventTile.js)

-   They are organised in a typically two-level hierarchy - first whether the
    component is a view or a structure, and then a broad functional grouping
    (e.g. 'rooms' here)

-   The view's CSS file MUST have the same name (e.g. view/rooms/MessageTile.css).
    CSS for matrix-react-sdk currently resides in
    https://github.com/matrix-org/matrix-react-sdk/tree/master/res/css.

-   Per-view CSS is optional - it could choose to inherit all its styling from
    the context of the rest of the app, although this is unusual for any but
-   Theme specific CSS & resources:
    https://github.com/matrix-org/matrix-react-sdk/tree/master/res/themes
    structural components (lacking presentation logic) and the simplest view
    components.

-   The view MUST *only* refer to the CSS rules defined in its own CSS file.
    'Stealing' styling information from other components (including parents)
    is not cool, as it breaks the independence of the components.

-   CSS classes are named with an app-specific name-spacing prefix to try to
    avoid CSS collisions. The base skin shipped by Matrix.org with the
    matrix-react-sdk uses the naming prefix "mx_". A company called Yoyodyne
    Inc might use a prefix like "yy_" for its app-specific classes.

-   CSS classes use upper camel case when they describe React components - e.g.
    .mx_MessageTile is the selector for the CSS applied to a MessageTile view.

-   CSS classes for DOM elements within a view which aren't components are named
    by appending a lower camel case identifier to the view's class name - e.g.
    .mx_MessageTile_randomDiv is how you'd name the class of an arbitrary div
    within the MessageTile view.

-   We deliberately use vanilla CSS 3.0 to avoid adding any more magic
    dependencies into the mix than we already have. App developers are welcome
    to use whatever floats their boat however. In future we'll start using
    css-next to pull in features like CSS variable support.

-   The CSS for a component can override the rules for child components.
    For instance, .mx_RoomList .mx_RoomTile {} would be the selector to override
    styles of RoomTiles when viewed in the context of a RoomList view.
    Overrides *must* be scoped to the View's CSS class - i.e. don't just define
    .mx_RoomTile {} in RoomList.css - only RoomTile.css is allowed to define its
    own CSS. Instead, say .mx_RoomList .mx_RoomTile {} to scope the override
    only to the context of RoomList views. N.B. overrides should be relatively
    rare as in general CSS inheritance should be enough.

-   Components should render only within the bounding box of their outermost DOM
    element. Page-absolute positioning and negative CSS margins and similar are
    generally not cool and stop the component from being reused easily in
    different places.

Originally `matrix-react-sdk` followed the Atomic design pattern as per
[patternlab.io](http://patternlab.io) to try to encourage a modular architecture. However, we
found that the grouping of components into atoms/molecules/organisms
made them harder to find relative to a functional split, and didn't emphasise
the distinction between 'structural' and 'view' components, so we backed away
from it.

## Github Issues

All issues should be filed under https://github.com/vector-im/element-web/issues
for now.

## Development

Ensure you have the latest LTS version of Node.js installed.

Using `yarn` instead of `npm` is recommended. Please see the Yarn 1 [install
guide](https://classic.yarnpkg.com/docs/install) if you do not have it
already. This project has not yet been migrated to Yarn 2, so please ensure
`yarn --version` shows a version from the 1.x series.

`matrix-react-sdk` depends on
[`matrix-js-sdk`](https://github.com/matrix-org/matrix-js-sdk). To make use of
changes in the latter and to ensure tests run against the develop branch of
`matrix-js-sdk`, you should set up `matrix-js-sdk`:

```bash
git clone https://github.com/matrix-org/matrix-js-sdk
cd matrix-js-sdk
git checkout develop
yarn link
yarn install
```

Then check out `matrix-react-sdk` and pull in dependencies:

```bash
git clone https://github.com/matrix-org/matrix-react-sdk
cd matrix-react-sdk
git checkout develop
yarn link matrix-js-sdk
yarn install
```

See the [help for `yarn link`](https://classic.yarnpkg.com/docs/cli/link) for
more details about this.

### Running tests

Ensure you've followed the above development instructions and then:

```bash
yarn test
```

### Running lint

To check your code complies with the project style, ensure you've followed the
above development instructions and then:

```bash
yarn lint
```

### Dependency problems

If you see errors (particularly "Cannot find module") running the lint or test
commands, and `yarn install` doesn't fix them, it may be because
yarn is not fetching git dependencies eagerly enough.

Try running this:

```bash
yarn cache clean && yarn install --force
```

Now the yarn commands should work as normal.

### End-to-End tests

Make sure you've got your Element development server running (by doing `yarn
start` in element-web), and then in this project, run `yarn run test:cypress`. See
[`docs/cypress.md`](https://github.com/matrix-org/matrix-react-sdk/blob/develop/docs/cypress.md)
for more information.
