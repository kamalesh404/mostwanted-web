import { CAR_BY_ID, CARS, UPGRADE_COST, UPGRADE_LABELS, type SaveData, type UpgradeState } from './types';

export class GarageUI {
  private el = document.getElementById('garage')!;
  private carsEl = document.getElementById('garage-cars')!;
  private upgsEl = document.getElementById('garage-upgs')!;
  private cashEl = document.getElementById('garage-cash')!;
  private upgTitle = document.getElementById('upg-title')!;
  save: SaveData;
  private onDirty: () => void;
  private onClose: () => void;
  private selectedForUpgrades: string;

  constructor(save: SaveData, onDirty: () => void, onClose: () => void) {
    this.save = save;
    this.onDirty = onDirty;
    this.onClose = onClose;
    document.getElementById('btn-garage-close')!.onclick = () => this.close();
    this.selectedForUpgrades = save.selected;
  }

  open() {
    this.selectedForUpgrades = this.save.selected;
    this.render();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.onClose();
  }

  get isOpen() { return this.el.classList.contains('open'); }

  private render() {
    const s = this.save;
    this.cashEl.textContent = `$${s.cash.toLocaleString()}`;
    this.carsEl.innerHTML = '';
    for (const spec of CARS) {
      const owned = s.owned.includes(spec.id);
      const row = document.createElement('div');
      row.className = 'car-row' + (s.selected === spec.id ? ' selected' : '');
      const st = `<div class="name">${spec.name}${s.selected === spec.id ? ' ★' : ''}</div>
        <div class="stats">${spec.desc} · top ${Math.round(spec.topSpeed * 3.6)} km/h · grip ${(spec.grip * 100) | 0}</div>`;
      row.innerHTML = `<div>${st}</div><div class="spacer"></div>`;
      if (!owned) {
        if (spec.price === 0) {
          row.innerHTML += `<span class="locked-note">Beat a blacklist rival</span>`;
        } else {
          const buy = document.createElement('button');
          buy.textContent = `Buy $${spec.price.toLocaleString()}`;
          buy.disabled = s.cash < spec.price;
          buy.onclick = () => { s.cash -= spec.price; s.owned.push(spec.id); s.upgrades[spec.id] = { engine: 0, handling: 0, nitrous: 0 }; this.render(); this.onDirty(); };
          row.appendChild(buy);
        }
      } else {
        const use = document.createElement('button');
        if (s.selected === spec.id) { use.textContent = 'Driving'; use.disabled = true; use.className = 'primary'; }
        else {
          use.textContent = 'Drive';
          use.onclick = () => { s.selected = spec.id; this.selectedForUpgrades = spec.id; this.render(); this.onDirty(); };
        }
        row.appendChild(use);
        const tune = document.createElement('button');
        tune.textContent = 'Tune';
        tune.onclick = () => { this.selectedForUpgrades = spec.id; this.renderUpgs(); };
        row.appendChild(tune);
      }
      this.carsEl.appendChild(row);
    }
    this.renderUpgs();
  }

  private renderUpgs() {
    const s = this.save;
    const id = this.selectedForUpgrades;
    const spec = CAR_BY_ID[id];
    this.upgTitle.textContent = `Upgrades — ${spec?.name ?? id}`;
    this.upgsEl.innerHTML = '';
    if (!spec || !s.owned.includes(id)) { this.upgsEl.innerHTML = '<span class="locked-note">Own this car to upgrade it.</span>'; return; }
    const upg: UpgradeState = s.upgrades[id];
    (Object.keys(UPGRADE_LABELS) as (keyof UpgradeState)[]).forEach((key) => {
      const lvl = upg[key];
      const row = document.createElement('div');
      row.className = 'upg-row';
      const pips = '●'.repeat(lvl) + '○'.repeat(3 - lvl);
      row.innerHTML = `<span>${UPGRADE_LABELS[key]}</span><span class="pips">${pips}</span><span class="spacer"></span>`;
      if (lvl >= 3) {
        row.innerHTML += `<span class="locked-note">Maxed</span>`;
      } else {
        const cost = UPGRADE_COST[lvl];
        const btn = document.createElement('button');
        btn.textContent = `$${cost.toLocaleString()}`;
        btn.disabled = s.cash < cost;
        btn.onclick = () => { s.cash -= cost; upg[key]++; this.render(); this.onDirty(); };
        row.appendChild(btn);
      }
      this.upgsEl.appendChild(row);
    });
  }
}
