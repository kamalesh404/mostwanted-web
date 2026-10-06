export interface CarSpec {
  id: string;
  name: string;
  model: string; // key in asset manifest
  color: number; // paint tint fallback
  accel: number; // m/s^2
  topSpeed: number; // m/s
  grip: number; // lateral grip 0..1
  nitro: number; // nitro accel bonus
  price: number; // 0 = starter
  desc: string;
}

export interface UpgradeState { engine: number; handling: number; nitrous: number; }

export interface SaveData {
  cash: number;
  wins: number;
  blacklist: number; // number of bosses defeated (0..5)
  owned: string[]; // car ids
  upgrades: Record<string, UpgradeState>;
  selected: string;
  escapes: number;
  bestSpeed: number;
  muted: boolean;
}

export interface RaceDef {
  id: string;
  kind: 'sprint' | 'circuit';
  name: string;
  reward: number;
  cps: [number, number][]; // checkpoint positions (x,z)
}

export interface RivalDef {
  level: number; // 1..5 (5 = first to face)
  name: string;
  car: string; // car spec id
  reward: number;
  carReward: string; // unlocked on defeat
  taunt: string;
}

/** In-game cars. `model` maps to the asset manifest key. */
export const CARS: CarSpec[] = [
  { id: 'rion',     name: 'Rion 3',       model: 'sedan_1',     color: 0x9aa3ad, accel: 9,  topSpeed: 46, grip: 0.86, nitro: 9,  price: 0,     desc: 'Reliable starter hatch' },
  { id: 'sportster',name: 'Sportster V8', model: 'muscle_car_1',color: 0xb0342c, accel: 12, topSpeed: 55, grip: 0.80, nitro: 12, price: 0,     desc: 'Loud, fast, slides a lot' },
  { id: 'cabrio',   name: 'Cabrio S',     model: 'sedan_2',     color: 0x2c6fb0, accel: 11, topSpeed: 52, grip: 0.88, nitro: 11, price: 6000,  desc: 'Balanced convertible' },
  { id: 'wagon',    name: 'Wagon GT',     model: 'van_1',       color: 0x3a7d54, accel: 10, topSpeed: 50, grip: 0.84, nitro: 10, price: 4500,  desc: 'Sleeper family hauler' },
  { id: 'taxi',     name: 'City Cab',     model: 'taxi_1',      color: 0xe8b820, accel: 10, topSpeed: 48, grip: 0.9,  nitro: 9,  price: 3500,  desc: 'Knows every shortcut' },
  { id: 'interceptor', name: 'Interceptor', model: 'police_1',  color: 0x1a1d22, accel: 13, topSpeed: 58, grip: 0.92, nitro: 13, price: 0,     desc: 'Boss reward — cop-spec cruiser' },
  { id: 'dominus',  name: 'Dominus R',    model: 'sports_car_1',color: 0x7a2ca0, accel: 15, topSpeed: 64, grip: 0.9,  nitro: 15, price: 0,     desc: 'Track-bred street weapon' },
  { id: 'bavara',   name: 'Bavara GT',    model: 'ferrari',     color: 0xc0c5cc, accel: 17, topSpeed: 72, grip: 0.95, nitro: 17, price: 0,     desc: 'The city legend' },
];

export const CAR_BY_ID: Record<string, CarSpec> = Object.fromEntries(CARS.map(c => [c.id, c]));

/** Blacklist ladder — face 15 first, climb down to #1. */
export const RIVALS: RivalDef[] = [
  { level: 5, name: 'Razor',    car: 'sportster', reward: 3000,  carReward: 'wagon',       taunt: 'Nice ride. Shame about the paint.' },
  { level: 4, name: 'Bull',     car: 'cabrio',    reward: 5000,  carReward: 'cabrio',      taunt: 'You call that driving?' },
  { level: 3, name: 'Ronnie',   car: 'dominus',   reward: 8000,  carReward: 'interceptor', taunt: 'The cops can’t save you.' },
  { level: 2, name: 'Baron',    car: 'dominus',   reward: 12000, carReward: 'dominus',     taunt: 'King of the highway.' },
  { level: 1, name: 'Sonny',    car: 'bavara',    reward: 20000, carReward: 'bavara',      taunt: 'This city has one legend. Not you.' },
];

/** Upgrades: level 0..3. Cost per next level. */
export const UPGRADE_COST = [2200, 4200, 7500];
export const UPGRADE_LABELS: Record<keyof UpgradeState, string> = {
  engine: 'Engine', handling: 'Handling', nitrous: 'Nitrous',
};
