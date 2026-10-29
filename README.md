# Character Forge — 3D Character Creator & Modeler

Aplicativo web profissional para criação, visualização e modelagem de personagens 3D, desenvolvido com **React 18**, **TypeScript**, **Vite**, **Three.js** e **React Three Fiber**.

## 🚀 Como Executar

```bash
# 1. Entrar na pasta do projeto
cd character-forge

# 2. Instalar dependências
npm install

# 3. Iniciar servidor de desenvolvimento
npm run dev

# 4. Gerar build de produção
npm run build
```

Para regenerar os modelos 3D a partir da malha base e morph targets do MakeHuman (caso deseje customizar o pipeline de geração):
```bash
node scripts/build_models.mjs
```

## 🧍 Modelos 3D e Licenças

1. **`public/models/personagem_humano_realista.glb`** *(Padrão — Realista HD)*
   - **Origem**: Malha humana canônica `hm08` do projeto **MakeHuman** combinada com *morph targets* anatômicos oficiais (`macrodetails` e `measure`).
   - **Licença**: **CC0 1.0 Universal (Domínio Público)**.
   - **Características**: 14.677 vértices e 27.036 triângulos (malha do corpo 100% fechada/manifold + globos oculares dedicados), rosto esculpido (olhos, pálpebras, nariz com narinas, boca, orelhas), mãos com os 5 dedos e polegares individualizados, pés anatômicos com os 5 dedos, articulações definidas e **9 Shape Keys (Morph Targets)** embutidos para ajuste de proporções em tempo real.

2. **`public/models/personagem_humano_anime.glb`** *(Estilo Anime HD)*
   - **Origem**: Derivado da topologia `hm08` MakeHuman com *morph targets* de estilização Anime (rosto afilado em V, olhos ampliados e expressivos, traços faciais delicados e silhueta esguia) + sombreamento Cel/Toon dedicado.
   - **Licença**: **CC0 1.0 Universal (Domínio Público)**.

3. **`public/models/personagem_base_humano.glb`** *(Protótipo Inicial)*
   - **Origem**: Arquivo original do diretório do projeto preservado integralmente, com correção automática da orientação de eixos (conversão Z-up para Y-up) para ficar em pé com os pés apoiados no piso (`Y = 0`).

## 🛠 Funcionalidades Implementadas

- **Visualização e Câmera**:
  - 7 ângulos de câmera predefinidos e calibrados: **Corpo Inteiro**, **Frente**, **Costas**, **Perfil Esquerdo**, **Perfil Direito**, **Visão Superior** e **Aproximar Rosto**.
  - Rotação contínua (**Turntable**), modo **Wireframe** e **Grade do Piso**.
- **Materiais e Aparência**:
  - Alternância imediata entre os estilos **Realista HD**, **Anime HD** e **Protótipo**.
  - Seleção de tons de pele (com sombreamento físico dérmico no estilo Realista e Cel/Toon no estilo Anime) e cor da íris dos olhos (textura procedural de alta resolução com esclera, anel límbico, fibras radiais, pupila e reflexo corneano).
- **Proporções Corporais Reais (Shape Keys / Morph Targets)**:
  - **Altura Total** (`1,45 m` a `2,10 m`) mantendo os pés apoiados no piso (`Y = 0`).
  - **Largura dos Ombros** (`-100%` a `+100%`).
  - **Largura do Tronco / Tórax** (`-100%` a `+100%`).
  - **Comprimento dos Braços** (`-100%` a `+100%`).
  - **Comprimento das Pernas** (`-100%` a `+100%`).
  - **Definição Muscular** (`0%` a `100%`).
- **Ferramentas de Edição e Transformação 3D**:
  - **Selecionar (`Q`)**: Seleção do personagem por clique com indicador luminoso na base.
  - **Mover (`W`)**: Gizmo 3D interativo nos eixos X, Y e Z + entradas numéricas.
  - **Rotacionar (`E`)**: Gizmo 3D de rotação nos eixos X, Y e Z independente da câmera + entradas em graus (`°`).
  - **Escalar (`R`)**: Gizmo 3D de escala + modo **Uniforme** ou **Independente por Eixo (X, Y, Z)**.
  - **Medir (`M`)**: Régua 3D ponto-a-ponto na superfície da malha exibindo a distância exata em metros (`m`) e centímetros (`cm`).
