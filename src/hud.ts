import * as THREE from 'three';
import { GRID, PITCH, WORLD_HALF } from './city';
import { RIVALS } from './types';

const $ = (id: string) => document.getElementById(id)!;

export class HUD {
  private minimap = $('minimap') as HTMLCanvasElement;
  private mm = this.minimap.getContext('2d')!;
  private toastEl = $('toasts');
  private centerEl = $('center-msg');
  private centerTimeout = 0;
  private lastCount = -1;

  setCash(cash: number) { $('cash-box').textContent = `$${cash.toLocaleString()}`; }

  setProgress(wins: number, blacklist: number) {
    const rank = blacklist >= RIVALS.length ? 1 : RIVALS.length - blacklist;
    $('wins-box').textContent = `Wins ${wins} · Blacklist #${rank}`;
  }

  setHeat(heat: number) {
    let html = '';
    for (let i = 1; i <= 5; i++) html += `<span class="star${i <= heat ? ' lit' : ''}">★</span>`;
    $('heat-box').innerHTML = html;
  }

  setPursuit(active: boolean, meter: number, busting = false) {
    const box = $('pursuit-box');
    box.style.display = active ? 'block' : 'none';
    if (active) {
      $('pursuit-label').textContent = busting ? 'BUSTED IN…' : 'PURSUIT';
      $('pursuit-fill').style.width = `${Math.min(100, meter * 100)}%`;
      $('pursuit-fill').style.background = busting ? '#ff3b30' : 'linear-gradient(90deg,#ffb14e,#ff3b30)';
    }
  }

  setSpeed(kmh: number, nitro01: number, tiresDamaged: boolean) {
    $('speedo-num').textContent = `${Math.round(kmh)}`;
    $('nitro-fill').style.width = `${nitro01 * 100}%`;
    $('dmg-box').style.display = tiresDamaged ? 'block' : 'none';
  }

  setRace(state: 'idle' | 'countdown' | 'racing' | 'finished', pos = 1, total = 4, cp = 0, cpTotal = 0, time = 0) {
    const box = $('race-box');
    if (state === 'idle') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const place = ['1st', '2nd', '3rd', '4th', '5th', '6th'][pos - 1] ?? `${pos}th`;
    $('race-pos').textContent = state === 'countdown' ? 'GET READY' : `${place}/${total}`;
    $('race-timer').textContent = `${time.toFixed(1)}s`;
    $('race-cp').textContent = `CP ${cp}/${cpTotal}`;
  }

  toast(text: string, kind: '' | 'good' | 'bad' = '', ms = 2600) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.toastEl.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  center(text: string | null, ms = 1200) {
    if (!text) { this.centerEl.style.display = 'none'; return; }
    this.centerEl.textContent = text;
    this.centerEl.style.display = 'block';
    clearTimeout(this.centerTimeout);
    this.centerTimeout = window.setTimeout(() => { this.centerEl.style.display = 'none'; }, ms);
  }

  count(n: number) {
    if (n === this.lastCount) return;
    this.lastCount = n;
    if (n > 0) this.center(`${n}`, 900);
  }

  markerInfo(text: string | null) {
    const el = $('marker-info');
    if (!text) { el.style.display = 'none'; return; }
    el.textContent = text;
    el.style.display = 'block';
  }

  fps(v: number) { $('fps').textContent = `${v | 0} fps`; }

  /** North-up minimap with roads, markers, cops and player. */
  drawMinimap(_player: THREE.Vector3, yaw: number, blips: { x: number; z: number; color: string; dot?: boolean }[]) {
    void _player;
    const g = this.mm;
    const S = this.minimap.width;
    const scale = S / (WORLD_HALF * 2 + 80);
    g.clearRect(0, 0, S, S);
    g.save();
    g.translate(S / 2, S / 2);
    g.scale(scale, scale);
    // roads
    g.strokeStyle = '#3b4657';
    g.lineWidth = 14;
    for (let i = 0; i < GRID; i++) {
      const c = (i - (GRID - 1) / 2) * PITCH;
      g.beginPath(); g.moveTo(c, -WORLD_HALF); g.lineTo(c, WORLD_HALF); g.stroke();
      g.beginPath(); g.moveTo(-WORLD_HALF, c); g.lineTo(WORLD_HALF, c); g.stroke();
    }
    // blips
    for (const b of blips) {
      g.fillStyle = b.color;
      if (b.dot) {
        g.beginPath(); g.arc(b.x, b.z, 9, 0, Math.PI * 2); g.fill();
      } else {
        g.save(); g.translate(b.x, b.z); g.rotate(-yaw);
        g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(-11, 12); g.closePath(); g.fill();
        g.restore();
      }
    }
    g.restore();
  }
}
