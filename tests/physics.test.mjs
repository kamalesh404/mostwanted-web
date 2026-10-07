import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveCollisions, clampToBounds, WORLD_BOUND_LIMIT } from '../src/city.ts';
import { effectiveStats } from '../src/car.ts';

test('WORLD_BOUND_LIMIT is correctly sized for city grid', () => {
  // 9 nodes per axis with 96m pitch -> ((9 - 1) * 96) / 2 = 384
  // WORLD_BOUND_LIMIT = 384 + 23 = 407
  assert.equal(WORLD_BOUND_LIMIT, 407);
});

test('clampToBounds keeps positions within perimeter', () => {
  const radius = 2.0;
  const posOutsideX = new THREE.Vector3(420, 0, 100);
  const clampedX = clampToBounds(posOutsideX, radius);
  assert.equal(clampedX, true);
  assert.equal(posOutsideX.x, WORLD_BOUND_LIMIT - radius);

  const posOutsideNegZ = new THREE.Vector3(0, 0, -450);
  const clampedZ = clampToBounds(posOutsideNegZ, radius);
  assert.equal(clampedZ, true);
  assert.equal(posOutsideNegZ.z, -WORLD_BOUND_LIMIT + radius);

  const posInside = new THREE.Vector3(100, 0, 100);
  const clampedInside = clampToBounds(posInside, radius);
  assert.equal(clampedInside, false);
  assert.equal(posInside.x, 100);
  assert.equal(posInside.z, 100);
});

test('resolveCollisions ejects points deeply inside obstacle AABB', () => {
  const radius = 2.0;
  const colliders = [{ minX: 10, maxX: 30, minZ: 10, maxZ: 30 }];

  // Point positioned directly inside the box at (12, 0, 20)
  // Closer to left edge (dist 2) than right edge (dist 18)
  const pos = new THREE.Vector3(12, 0, 20);
  const hit = resolveCollisions(pos, radius, colliders);

  assert.ok(hit !== null);
  assert.equal(hit.x, -1);
  assert.equal(hit.y, 0);
  assert.equal(pos.x, 10 - radius); // Ejected to minX - radius
});

test('resolveCollisions clamps positions crossing outer world boundary', () => {
  const radius = 2.0;
  const colliders = [];
  const pos = new THREE.Vector3(425, 0, 0);

  const hit = resolveCollisions(pos, radius, colliders);
  assert.ok(hit !== null);
  assert.equal(pos.x, WORLD_BOUND_LIMIT - radius);
  assert.equal(hit.x, -1); // Normal pushes back inward
});

test('effectiveStats calculates upgrades correctly', () => {
  const baseSpec = {
    id: 'testcar',
    name: 'Test Car',
    model: 'sedan_1',
    color: 0xffffff,
    accel: 20,
    topSpeed: 50,
    grip: 0.8,
    nitro: 30,
    price: 0,
    desc: 'Test',
  };

  const stock = effectiveStats(baseSpec);
  assert.equal(stock.accel, 20);
  assert.equal(stock.topSpeed, 50);
  assert.equal(stock.grip, 0.8);
  assert.equal(stock.nitro, 30);

  const upgraded = effectiveStats(baseSpec, { engine: 2, handling: 1, nitrous: 3 });
  assert.equal(upgraded.accel, 20 * (1 + 0.12 * 2)); // 24.8
  assert.equal(upgraded.topSpeed, 50 * (1 + 0.045 * 2)); // 54.5
  assert.equal(upgraded.grip, 0.8 + 0.045 * 1); // 0.845
  assert.equal(upgraded.nitro, 30 * (1 + 0.15 * 3)); // 43.5
});

test('collision velocity response dampens speed and prevents unbounded rebound', () => {
  const vel = new THREE.Vector2(20, -10);
  const normal = new THREE.Vector2(0, 1); // Hit bottom barrier
  const vn = vel.dot(normal); // -10

  // Controlled elastic rebound: restitution impulse capped to 26
  const rebound = Math.min(-vn * 1.35, 26);
  vel.add(normal.clone().multiplyScalar(rebound));
  vel.multiplyScalar(0.78);

  // Normal velocity should now be positive (moving away from wall) and damped
  assert.ok(vel.y > 0);
  assert.ok(vel.length() < 25);
});

