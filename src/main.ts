import * as THREE from 'three';
import { loadModels, cloneModel, type ModelMap } from './assets';
import { buildCity, type CityData } from './city';
import { CarController, emptyInput, type CarInput } from './car';
import { TrafficManager, Racer } from './ai';
import { PoliceSystem, type PoliceEvent } from './police';
import { RaceManager, type RaceMarker } from './races';
import { canChallenge, beatRival, challengeRequirement, currentRival } from './blacklist';
import { GarageUI } from './garage';
import { HUD } from './hud';
import { GameAudio } from './audio';
import { loadSave, persist, clearSave } from './save';
import { CAR_BY_ID, type RaceDef, type SaveData } from './types';

// ---------- renderer / scene ----------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0x2a3550;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 160, 780);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 1400);
camera.position.set(0, 6, 12);

const hemi = new THREE.HemisphereLight(0x93a4c4, 0x3d3a34, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, 1.7);
sun.position.set(180, 120, -80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

// ---------- game state ----------
type Mode = 'loading' | 'menu' | 'play';
let mode: Mode = 'loading';
const save: SaveData = loadSave();
const hud = new HUD();
const audio = new GameAudio();
audio.muted = save.muted;

let models: ModelMap;
let city: CityData;
let traffic: TrafficManager;
let police: PoliceSystem;
let races: RaceManager;
let garage: GarageUI;
let player: CarController;

const rivals: Racer[] = [];
let currentMarker: RaceMarker | null = null;

// ---------- input ----------
const keys: Record<string, boolean> = {};
const touchState = { left: false, right: false, nitro: false, brake: false, throttle: false };
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') onAction();
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyM') toggleMute();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  touchState.left = touchState.right = touchState.throttle = touchState.brake = touchState.nitro = false;
});

function bindTouch(id: string, down: () => void, up: () => void) {
  const el = document.getElementById(id)!;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}
bindTouch('t-left', () => touchState.left = true, () => touchState.left = false);
bindTouch('t-right', () => touchState.right = true, () => touchState.right = false);
bindTouch('t-nitro', () => touchState.nitro = true, () => touchState.nitro = false);
bindTouch('t-brake', () => touchState.brake = true, () => touchState.brake = false);
bindTouch('t-action', () => onAction(), () => { });

function readInput(): CarInput {
  const i = emptyInput();
  const left = keys['KeyA'] || keys['ArrowLeft'] || touchState.left;
  const right = keys['KeyD'] || keys['ArrowRight'] || touchState.right;
  i.steer = (left ? -1 : 0) + (right ? 1 : 0);
  i.throttle = (keys['KeyW'] || keys['ArrowUp'] || touchState.throttle) ? 1 : 0;
  i.brake = (keys['KeyS'] || keys['ArrowDown'] || touchState.brake) ? 1 : 0;
  i.handbrake = !!keys['Space'];
  i.nitro = !!keys['ShiftLeft'] || !!keys['ShiftRight'] || touchState.nitro;
  if (isTouch && races.state !== 'racing' && races.state !== 'countdown') {
    i.throttle = touchState.brake ? 0 : 1; // auto-throttle on mobile
  }
  return i;
}

// ---------- camera ----------
interface CamConfig {
  name: string;
  dist: number;
  height: number;
  look: number;
  lerpSpeed: number;
}

const CAM_MODES: CamConfig[] = [
  { name: 'Chase Camera', dist: 9.5, height: 4.2, look: 10, lerpSpeed: 6.5 },
  { name: 'Far Camera', dist: 15.0, height: 7.0, look: 12, lerpSpeed: 4.5 },
  { name: 'Hood Camera', dist: 0.4, height: 1.55, look: 30, lerpSpeed: 16.0 },
];
let camMode = 0;
const camPos = new THREE.Vector3(0, 6, 12);
const camLookTarget = new THREE.Vector3(0, 1.2, 0);

function cycleCamera() {
  camMode = (camMode + 1) % CAM_MODES.length;
  hud.toast(CAM_MODES[camMode].name, '', 1400);
}

function resetCamera() {
  if (!player) return;
  const m = CAM_MODES[camMode];
  const fwd = player.forward;
  camPos.set(player.pos.x - fwd.x * m.dist, player.pos.y + m.height, player.pos.z - fwd.y * m.dist);
  camLookTarget.set(player.pos.x + fwd.x * m.look, player.pos.y + (camMode === 2 ? 1.4 : 1.2), player.pos.z + fwd.y * m.look);
  camera.position.copy(camPos);
  camera.lookAt(camLookTarget);
}

function updateCamera(dt: number) {
  const m = CAM_MODES[camMode];
  const fwd = player.forward;
  const speed01 = Math.min(1, player.speed / 70);

  // Smooth dynamic FOV transitions (speed warp & nitrous boost)
  const nosActive = (keys['ShiftLeft'] || keys['ShiftRight'] || touchState.nitro) && player.nitroAmount > 0;
  const targetFov = 62 + speed01 * 14 + (nosActive ? 5 : 0);
  const fovDiff = targetFov - camera.fov;
  if (Math.abs(fovDiff) > 0.02) {
    camera.fov += fovDiff * Math.min(1, dt * 6.0);
    camera.updateProjectionMatrix();
  }

  // Desired camera position with velocity anticipation
  const targetX = player.pos.x - fwd.x * m.dist + player.vel.x * 0.05;
  const targetY = player.pos.y + m.height;
  const targetZ = player.pos.z - fwd.y * m.dist + player.vel.y * 0.05;
  const target = new THREE.Vector3(targetX, targetY, targetZ);

  // Smooth position lerp transition
  camPos.lerp(target, Math.min(1, dt * m.lerpSpeed));
  camera.position.copy(camPos);

  // Smooth gaze/look-at interpolation to eliminate harsh yaw shearing
  const lookHeight = camMode === 2 ? 1.4 : 1.2;
  const desiredLook = new THREE.Vector3(
    player.pos.x + fwd.x * m.look,
    player.pos.y + lookHeight,
    player.pos.z + fwd.y * m.look,
  );
  camLookTarget.lerp(desiredLook, Math.min(1, dt * 9.5));
  camera.lookAt(camLookTarget);

  // Subtle speed vibration
  const shake = speed01 * 0.04;
  camera.position.y += (Math.random() - 0.5) * shake;
}

// ---------- world assembly ----------
function buildPlayer(id: string) {
  const spec = CAR_BY_ID[id];
  if (!spec) throw new Error(`unknown car ${id}`);
  const mesh = cloneModel(models, spec.model, spec.color);
  scene.add(mesh);
  const car = new CarController(spec, mesh, save.upgrades[id]);
  car.setCity(city);
  car.isPlayer = true;
  car.crashedInto = (force) => {
    audio.crash(force);
    shake += force * 0.7;
  };
  return car;
}

function swapPlayer(id: string) {
  const start = player ? player.pos.clone() : new THREE.Vector3(0, 0, 20);
  const yaw = player ? player.yaw : 0;
  if (player) scene.remove(player.mesh);
  player = buildPlayer(id);
  player.place(start.x, start.z, yaw);
  resetCamera();
}

function setupWorld() {
  scene.add(city.group);
  scene.add(traffic.root);
  scene.add(police.root);
  scene.add(races.root);
  swapPlayer(save.selected);
  player.place(0, 20, 0);
  resetCamera();
}

// ---------- races ----------
function activeRivalCount() { return 3; }

function spawnRivals(def: RaceDef) {
  clearRivals();
  const rival = currentRival(save);
  const isBoss = currentMarker?.def === 'boss';
  const ids = isBoss && rival ? [rival.car, rival.car, rival.car] : ['sportster', 'cabrio', 'wagon'];
  const colors = isBoss ? [0x301820, 0x101418, 0x3a2a10] : [0x50607a, 0x7a5060, 0x507a5a];
  const v = player.forward;
  for (let n = 0; n < activeRivalCount(); n++) {
    const spec = CAR_BY_ID[ids[n]];
    const mesh = cloneModel(models, spec.model, colors[n]);
    scene.add(mesh);
    const car = new CarController(spec, mesh);
    car.setCity(city);
    const side = (n - 1) * 3.2;
    car.place(player.pos.x + v.x * 6 + v.y * side, player.pos.z + v.y * 6 - v.x * side, player.yaw);
    const cps = def.cps.map(([x, z]) => new THREE.Vector2(x, z));
    const aggression = isBoss ? 0.95 : 0.55 + n * 0.12;
    const racer = new Racer(spec.name, car, cps, aggression);
    car.crashedInto = () => { /* rivals don't play sounds */ };
    rivals.push(racer);
  }
}

function clearRivals() {
  for (const r of rivals) scene.remove(r.car.mesh);
  rivals.length = 0;
}

function startRace(def: RaceDef) {
  races.start(def);
  spawnRivals(def);
  audio.init(); audio.resume();
}

function endRace(place: number, time: number) {
  const def = races.current!;
  const isBoss = currentMarker?.def === 'boss';
  const win = place === 1;
  clearRivals();
  races.abort();
  let pursuit = 0;
  if (win) {
    save.cash += def.reward;
    if (!isBoss) save.wins++;
    audio.cash();
    hud.toast(`Race won — +$${def.reward.toLocaleString()}`, 'good');
    if (isBoss && canChallenge(save)) {
      const beaten = beatRival(save);
      if (beaten) {
        hud.toast(`Blacklist rival #${RANK(beaten.level)} ${beaten.name} beaten! Won ${CAR_BY_ID[beaten.carReward].name}!`, 'good', 5200);
        save.wins = Math.max(save.wins, challengeRequirement(save));
      }
    } else if (isBoss) {
      hud.toast(`You must win ${challengeRequirement(save) - save.wins} more street race${challengeRequirement(save) - save.wins === 1 ? '' : 's'} to challenge ${currentRival(save)?.name}.`, '', 4200);
    }
    pursuit = 1; // winning attracts heat
  } else {
    pursuit = 0.5;
    hud.toast(`Finished ${['1st', '2nd', '3rd', '4th'][place - 1] ?? place + 'th'} — no reward`, 'bad');
  }
  hud.setProgress(save.wins, save.blacklist);
  hud.setCash(save.cash);
  persist(save);
  void time;
  // race attract the cops
  setTimeout(() => { if (mode === 'play' && pursuit > 0 && !police.active) police.startPursuit(pursuit >= 1 ? 2 : 1); }, 1500);
}

function RANK(level: number) { return level; }

// ---------- police events ----------
function bindPolice() {
  police.onEvent = (e: PoliceEvent, data?: number) => {
    if (e === 'spotted') {
      audio.beep();
      hud.toast('Police spotted you!', 'bad');
    } else if (e === 'heatup') {
      hud.setHeat(police.heat);
      hud.toast(`Heat level ${data}!`, 'bad');
    } else if (e === 'busted') {
      audio.bust();
      const fine = Math.min(save.cash, 500 + police.heat * 350);
      save.cash -= fine;
      persist(save);
      gameOver(false, `The cops busted you. Fine: $${fine.toLocaleString()}. Heat resets.`);
    } else if (e === 'escaped') {
      save.escapes++;
      const bounty = 300 * police.heat;
      save.cash += bounty;
      persist(save);
      hud.setCash(save.cash);
      hud.toast(`Pursuit evaded! +$${bounty.toLocaleString()} bounty`, 'good');
      police.endPursuit();
      hud.setHeat(0);
    } else if (e === 'spike') {
      hud.toast('Spike strips! Watch your tires', 'bad');
    } else if (e === 'roadblock') {
      hud.toast('Roadblock ahead!', 'bad');
    }
  };
}

// ---------- game over / garage / menus ----------
function gameOver(won: boolean, detail: string) {
  if (police.active) { police.endPursuit(); hud.setHeat(0); }
  mode = 'menu';
  hud.setPursuit(false, 0);  audio.engine(0, 0); audio.siren(0); audio.skid(0);
  const go = document.getElementById('gameover')!;
  go.classList.add('open');
  go.classList.toggle('won', won);
  go.classList.toggle('lost', !won);
  document.getElementById('go-title')!.textContent = won ? 'CHAMPION' : 'BUSTED';
  document.getElementById('go-detail')!.textContent = detail;
}

function onAction() {
  if (mode !== 'play') return;
  const marker = races.markerNear(player.pos, 16);
  if (!marker) return;
  if (marker.def === 'safehouse') {
    audio.beep();
    garage.open();
  } else if (marker.def === 'boss') {
    const rival = currentRival(save);
    if (!rival) { hud.toast('You are #1. The city is yours!', 'good'); return; }
    if (!canChallenge(save)) {
      hud.toast(`${rival.name}: "${rival.taunt}" — win ${challengeRequirement(save) - save.wins} more races first.`, 'bad', 4200);
      return;
    }
    currentMarker = marker;
    startRace(BOSS_RACE(rival.name));
  } else {
    currentMarker = marker;
    startRace(marker.def);
  }
}

function BOSS_RACE(name: string): RaceDef {
  const mid = (9 - 1) / 2;
  const n = (i: number, j: number) => [ (i - mid) * 96, (j - mid) * 96 ] as [number, number];
  return { id: 'boss', kind: 'sprint', name: `vs ${name}`, reward: 4000, cps: [n(4, 4), n(4, 0), n(0, 0), n(0, 7), n(7, 7), n(7, 3)] };
}

function toggleMute() {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  persist(save);
  hud.toast(save.muted ? 'Muted' : 'Sound on');
}

// ---------- boot ----------
function bindMenu() {
  document.getElementById('btn-drive')!.onclick = () => {
    audio.init(); audio.resume();
    document.getElementById('mainmenu')!.classList.remove('open');
    mode = 'play';
  };
  document.getElementById('btn-reset')!.onclick = () => {
    clearSave();
    location.reload();
  };
  document.getElementById('btn-continue')!.onclick = () => {
    document.getElementById('gameover')!.classList.remove('open');
    mode = 'play';
    player.applySpike(0);
  };
}

async function boot() {
  const fill = document.getElementById('load-fill')!;
  const status = document.getElementById('load-status')!;
  models = await loadModels((p, label) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    status.textContent = p < 1 ? `Loading ${label}…` : 'Building the city…';
  });
  city = buildCity(models);
  traffic = new TrafficManager(city, models, 26);
  police = new PoliceSystem(city, models);
  races = new RaceManager(city);
  garage = new GarageUI(save,
    () => { persist(save); },
    () => { swapPlayer(save.selected); persist(save); });
  bindPolice();
  bindMenu();
  setupWorld();
  hud.setCash(save.cash);
  hud.setProgress(save.wins, save.blacklist);
  hud.setHeat(0);
  document.getElementById('loading')!.classList.remove('open');
  document.getElementById('mainmenu')!.classList.add('open');
  mode = 'menu';
  const note = document.getElementById('save-note')!;
  note.textContent = save.blacklist > 0 || save.wins > 0
    ? `Welcome back. ${save.wins} wins, blacklist #${Math.max(1, 5 - save.blacklist)}.`
    : note.textContent;
  requestAnimationFrame(frame);
}

// ---------- loop ----------
let last = performance.now();
let shake = 0;
let fpsAcc = 0, fpsN = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { hud.fps(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  if (mode === 'play' || mode === 'menu') {
    const playing = mode === 'play' && !garage?.isOpen;
    // --- player ---
    const input = playing ? readInput() : emptyInput();
    const wasDrifting = player.drifting;
    player.update(dt, input);
    if (player.drifting && !wasDrifting && player.speed > 12) audio.skid(0.8);
    audio.engine(Math.min(1, player.speed / 70), input.throttle);
    audio.skid(player.drifting ? 0.7 : 0);

    // --- race markers proximity ---
    if (races.state === 'idle') {
      const marker = races.markerNear(player.pos, 16);
      if (marker && marker !== currentMarker) {
        hud.markerInfo(marker.def === 'safehouse' ? 'Press E — Garage & safehouse'
          : marker.def === 'boss' ? 'Press E — Blacklist challenge'
          : 'Press E — Street race');
      } else hud.markerInfo(null);
      if (!marker) currentMarker = null;
    }

    // --- police ---
    police.update(dt, player, races.state === 'racing');
    audio.siren(police.active ? Math.min(1, 1 - police.nearestCopDistance(player.pos) / 300) : 0);
    if (police.active) {
      hud.setPursuit(true, police.meter, police.isBusting());
      hud.setHeat(police.heat);
    } else hud.setPursuit(false, 0);

    // --- rivals ---
    for (const r of rivals) r.update(dt, player.pos, races.state === 'racing' ? r.progressMeters() : 0, () => { });

    // --- race progress ---
    if (races.state === 'countdown') {
      const n = Math.ceil(races.countdown - 1);
      hud.count(n);
      if (races.countdown <= 1) { hud.center('GO!', 700); audio.go(); }
    }
    if (races.state === 'racing' || races.state === 'countdown') {
      const rivalsSorted = rivals.slice().sort((a, b) => b.progressMeters() - a.progressMeters());
      let place = 1;
      const myProg = races.cpIndex * 1e6 - (races.nextCp ? Math.hypot(races.nextCp.x - player.pos.x, races.nextCp.y - player.pos.z) : 0);
      for (const r of rivalsSorted) if (r.progressMeters() > myProg) place++;
      hud.setRace(races.state, place, rivals.length + 1, races.cpIndex, races.cps.length, races.raceTime);
    } else hud.setRace('idle');
    const result = races.update(dt, player.pos, rivals);
    if (result) endRace(result.place, result.time);

    // --- traffic ---
    traffic.update(dt, player.pos, player.vel, (force) => {
      audio.crash(force * 0.8);
      shake += force * 0.5;
      player.vel.multiplyScalar(0.86);
    });

    // --- sun follows player for shadow coverage ---
    sun.position.set(player.pos.x + 180, 120, player.pos.z - 80);
    sun.target.position.set(player.pos.x, 0, player.pos.z);

    updateCamera(dt);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-6 * dt);
      if (shake < 0.01) shake = 0;
    }

    // --- HUD ---
    hud.setSpeed(player.speedKmh, player.nitroFraction(), player.tireDamage > 0);
    if (player.speedKmh > save.bestSpeed) { save.bestSpeed = player.speedKmh; }

    // --- minimap ---
    const blips: { x: number; z: number; color: string; dot?: boolean }[] = [];
    for (const m of races.markers) {
      if (!m.mesh.visible) continue;
      blips.push({ x: m.pos.x, z: m.pos.y, color: m.def === 'boss' ? '#ff4030' : m.def === 'safehouse' ? '#35d97b' : '#ffd75e', dot: true });
    }
    if (races.state === 'racing' && races.nextCp) blips.push({ x: races.nextCp.x, z: races.nextCp.y, color: '#3fd0ff', dot: true });
    for (const cop of police.cops) blips.push({ x: cop.car.pos.x, z: cop.car.pos.z, color: '#4d8dff', dot: true });
    blips.push({ x: player.pos.x, z: player.pos.z, color: '#ffffff' });
    hud.drawMinimap(player.pos, player.yaw, blips);
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

boot().catch((err) => {
  const status = document.getElementById('load-status')!;
  status.textContent = `Failed to load: ${err}`;
  status.style.color = '#ff7b6b';
  console.error(err);
});
