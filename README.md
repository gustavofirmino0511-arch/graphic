# Character Forge — 3D Character Creator

Professional web application for creating and modeling 3D characters.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🛠 Tech Stack

- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool & dev server
- **Three.js** — 3D rendering engine
- **React Three Fiber** — React renderer for Three.js
- **@react-three/drei** — Useful helpers for R3F

## 📁 Project Structure

```
character-forge/
├── public/
│   ├── models/
│   │   └── personagem_base_humano.glb   # Base character model
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Header.tsx          # Top navigation bar
│   │   ├── Toolbar.tsx         # Left tools sidebar
│   │   ├── Viewport.tsx        # 3D viewport with model
│   │   ├── PropertiesPanel.tsx # Right properties panel
│   │   └── StatusBar.tsx       # Bottom status bar
│   ├── styles/
│   │   └── global.css          # Global styles
│   ├── App.tsx                 # Main application component
│   └── main.tsx                # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎮 Viewport Controls

| Action  | Mouse          | Touch          |
| ------- | -------------- | -------------- |
| Rotate  | Left click     | One finger     |
| Pan     | Right click    | Two fingers    |
| Zoom    | Scroll wheel   | Pinch          |

## 🌐 Deploy

### Render (Static Site)

1. Push to GitHub
2. Create a new **Static Site** on [Render](https://render.com)
3. Set **Build Command**: `npm install && npm run build`
4. Set **Publish Directory**: `dist`

### Vercel / Netlify

1. Connect your GitHub repo
2. Framework: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`

## 📋 Roadmap

- [x] Load and display GLB character model
- [x] Orbital camera controls (rotate, pan, zoom)
- [x] Professional UI with toolbar and properties panel
- [x] Responsive design (desktop + mobile)
- [x] Wireframe toggle
- [x] Grid toggle
- [ ] Body proportion controls
- [ ] Facial parameters
- [ ] Skin tone selector
- [ ] Hair and clothing components
- [ ] Realistic / Anime style toggle
- [ ] Save / Load project
- [ ] GLB export

## 📝 License

MIT
