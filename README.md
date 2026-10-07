<div align="center">

<img src="docs/banner.svg" alt="MostWanted-Web banner" width="100%"/>

# MostWanted-Web 🏁

**An open-world street racing game that runs in your browser.** Inspired by *Need for Speed: Most Wanted (2005)* — free-roam a 3D city, win street races, outrun police pursuits with escalating heat, and climb the Blacklist to become #1.

![GitHub repo size](https://img.shields.io/badge/genre-open--world%20racer-ff5a2a)
![three.js](https://img.shields.io/badge/three.js-0.186-049ef4?logo=three.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/assets-CC0%20%2F%20CC--BY-green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

**▶ Play it live: `https://kamalesh404.github.io/mostwanted-web/`** *(published automatically by GitHub Actions on every push to `main`)*

</div>

---

## 🎮 What is this?

A complete, self-contained arcade racing game built as a **non-commercial fan tribute** to NFS Most Wanted 2005 — rebuilt from scratch for modern browsers. No engine downloads, no external plugins: open the link and drive. Every car and building is a **real 3D model (GLB)**, not placeholder geometry (attribution in [CREDITS.md](CREDITS.md)).

### Core Game Loop
```
Free roam the city ──► Win street races ──► Attract police heat ──► Evade pursuits
        ▲                                                               │
        └─── Win boss races & take their car ◄── Challenge Blacklist ───┘
```

### Key Features

| Feature | Description |
|---|---|
| 🌆 **Open-world city** | 9×9-block 3D city with dynamic traffic, parks, parking lots, streetlights, and detailed building models |
| 🏎️ **8 drivable cars** | Distinct handling curves, purchase options + boss trophy rewards; Engine, Handling, and Nitrous upgrade stages |
| 🚓 **Police pursuits** | Dynamic pursuit meter, **heat levels 1–5**, ramming interceptors, road roadblocks, and spike strips |
| 🏁 **Street races** | 5 checkpoint races (sprints and circuits) with cash payouts and rubber-band rival AI |
| 👑 **Blacklist Ladder** | 5 bosses (Razor → Sonny); fulfill win conditions, challenge rivals, and claim their custom rides |
| 💾 **Auto-save** | Cash, unlocked vehicles, performance parts, and Blacklist milestones persist in `localStorage` |
| 🔊 **Procedural audio** | Engine throttle, sirens, skids, and impact crashes synthesized live via the Web Audio API |
| 📱 **Mobile support** | Responsive touch controls featuring analog-style steering buttons, boost, brake, and auto-throttle |

---

## ⌨️ Control Map

### Desktop Controls

| Action | Primary Key | Secondary Key | Notes |
|---|---|---|---|
| **Accelerate** | `W` | `Up Arrow` | Forward drive with top-speed gearing |
| **Steer Left** | `A` | `Left Arrow` | Dynamically smoothed turn response |
| **Steer Right** | `D` | `Right Arrow` | Dynamically smoothed turn response |
| **Brake / Reverse** | `S` | `Down Arrow` | Progressive braking / reverse gear |
| **Handbrake / Drift** | `Space` | — | Breaks rear grip for initiating controlled power-slides |
| **Nitrous Boost** | `Left Shift` | `Right Shift` | Drains NOS reserve to provide sudden torque burst |
| **Interact / Action** | `E` | — | Enters safehouse garage, initiates street races, or challenges bosses |
| **Cycle Camera** | `C` | — | Cycles between Chase (near), Far (orbit), and Hood views |
| **Audio Mute** | `M` | — | Toggles Web Audio synthesizer output |

### Camera Modes

* **Chase Camera** (Default): Centered third-person chase camera with dynamic speed warp, velocity anticipation, and smoothed yaw tracking.
* **Far Camera**: Elevated panoramic chase view providing higher situational awareness during police chases and crowded intersections.
* **Hood Camera**: Low-slung front-hood perspective providing direct road-level speed immersion.

### Mobile & Touch Controls

When launched on touch-enabled devices, on-screen virtual buttons are automatically mounted:
* **Steer Left (`◀`) & Steer Right (`▶`)**: Touch-hold buttons for steering input.
* **Nitrous (`NOS`)**: Instant boost engagement with tactile HUD depletion gauge.
* **Brake (`BRAKE`)**: Hard braking; when released, auto-throttle maintains cruise speed.
* **Action (`ACTION`)**: Contextual trigger for race start points and safehouse garage entries.

---

## 📐 Architecture & Subsystems

The project uses a modular, component-based TypeScript architecture built directly on three.js without heavyweight third-party physics engines:

```
src/
├── main.ts         # Game loop, rendering pipeline, camera controller & mode states
├── car.ts          # Vehicle dynamics, steering smoothing, bounce damping & boundary clamps
├── city.ts         # Procedural 9x9 city grid, instanced meshes & AABB spatial collisions
├── ai.ts           # Traffic flow simulation & rubber-band rival racer pathfinding
├── police.ts       # Pursuit state machine, heat levels (1-5), roadblocks & spike strips
├── races.ts        # Sprint & circuit checkpoint navigation, timers & leaderboards
├── blacklist.ts    # Boss progression requirements, ladder rewards & rival profiles
├── garage.ts       # Car dealership, performance upgrade trees & paint previews
├── hud.ts          # Canvas-rendered HUD, analog speedometer, pursuit meter & radar minimap
├── audio.ts        # Web Audio API procedural synthesis (engine pitch, sirens, skids, crash)
├── save.ts         # LocalStorage persistence, profile serialization & migration
├── assets.ts       # GLTF loader pipeline with Draco compression & model caching
└── types.ts        # Shared data definitions, vehicle specifications & game interfaces
```

### Vehicle Dynamics & Physics Model (`src/car.ts`)
* **Newtonian Forward/Lateral Decomposition**: Speed is split into forward heading and lateral drift components. Lateral grip decays exponentially based on tire compound and handling upgrades.
* **Rate-Smoothed Steering**: Raw keyboard binary inputs (-1 / 0 / 1) pass through a dynamic responsiveness filter with quick grip-based turn entry and swift spring centering upon release.
* **Collision Velocity Limiting**: Wall and obstacle impacts resolve elastic rebound with energy dissipation (`restitution ≈ 0.35`), tangential scrub damping, and an absolute safety cap (`MAX_VELOCITY_CAP = 85 m/s`) to prevent pinball slingshots.
* **Boundary Containment**: Position coordinates are continuously clamped against the city perimeter barrier boundaries (`WORLD_BOUND_LIMIT = 407m`), dampening velocity inward if boundary limits are breached.

### Procedural Generation & Rendering (`src/city.ts`)
* **Instanced Batching**: Buildings, trees, streetlights, and road markings leverage `THREE.InstancedMesh` for minimal draw calls.
* **Spatial Collision Detection**: Obstacles generate 2D Axis-Aligned Bounding Boxes (AABB). The collision resolver detects overlaps, calculates minimal penetration axes, and pushes vehicles outside obstacle hulls.

---

## 🚀 Local Setup & Development Guide

### Prerequisites
* **Node.js**: v20.x or higher (Node.js v22/v24 recommended)
* **npm**: v10.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/kamalesh404/mostwanted-web.git
cd mostwanted-web

# Install dependencies
npm install
```

> [!NOTE]
> **Windows PowerShell Users**: If running `npm` produces a script execution policy error (`PSSecurityException`), use `npm.cmd` directly:
> ```powershell
> npm.cmd install
> npm.cmd run dev
> ```

### Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts Vite local development server at `http://localhost:5173` with Hot Module Replacement (HMR) |
| `npm run build` | Runs TypeScript compilation (`tsc`) and generates an optimized production bundle in `dist/` |
| `npm run preview` | Spins up a local static server to test the production bundle |
| `npm run typecheck` | Validates TypeScript types across the entire project (`tsc --noEmit`) |
| `npm test` | Runs the automated physics and game math unit test suite using Node's native test runner |

### Running Tests

Automated unit tests verify boundary containment, AABB ejection algorithms, and vehicle upgrade math:

```bash
npm test
```

---

## ☁️ Deployment

Automated CI/CD is configured via GitHub Actions in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

Every push to the `main` branch triggers:
1. Fresh dependency installation.
2. Full TypeScript type checking and asset bundling via `npm run build`.
3. Automated deployment of the `dist/` directory to **GitHub Pages**.

To enable on a fork:
1. Navigate to repository **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

---

## ⚖️ License & Attribution

* **Code**: Released under the [MIT License](LICENSE).
* **3D Assets & Models**: See [CREDITS.md](CREDITS.md) for full licensing and creator credits (licensed under CC0, CC-BY 3.0, and CC-BY-NC non-commercial fan tribute usage).

---

<div align="center">
<sub>Star ⭐ the repo if you enjoy the game — PRs and community contributions are welcome!</sub>
</div>
