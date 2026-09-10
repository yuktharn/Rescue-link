/**
 * src/utils/localization.ts — FIXED v2
 *
 * All fixes from v1 (proper least-squares trilateration, zone fallback,
 * confidence scoring) are retained. New fix in v2:
 *
 * FIX (v2) – VictimMap blank with only 1 remote device
 *   calculateVictimLocations() initialises the `known` map with:
 *     known.set('responder', {x:0, y:0})
 *   But RSSI readings are stored as:
 *     { fromDeviceId: 'RL_MYID', toDeviceId: 'RL_THEIRID', rssi: -72 }
 *   The responder's own RL_ ID is NEVER in the `known` map, so when we look
 *   up `refs` for a victim's reading we find no matching position → refs=[] →
 *   no location calculated → map stays empty even with 1 device.
 *
 *   Fix: accept an optional `responderId` parameter (the responder's own
 *   "RL_XXXXXXXX" device ID) and also register it in `known` at (0,0).
 *   This means any RSSI reading involving the responder (ownId ↔ victimId)
 *   can now be resolved → victim gets placed at the zone-fallback position
 *   (≈10m at 45° from origin) as soon as the first reading arrives.
 *
 *   With 2+ devices the trilateration path runs as before, giving a proper
 *   least-squares position instead of the zone fallback.
 *
 * POSITION BUG 1 (v1): trilaterate() was a weighted centroid, not trilateration.
 *   FIX: Proper least-squares via linearised circle equations.
 *
 * POSITION BUG 2 (v1): zoneBasedPositioning() for 1 reference returned the
 *   reference's own position. FIX: offset by estimated distance at 45°.
 *
 * POSITION BUG 3 (v1): confidence = 1 - variance/100 was unitless nonsense.
 *   FIX: Based on reading count and RSSI stddev.
 *
 * POSITION BUG 4 (v1): calculateLocations() was only called in RESPONDER mode.
 *   FIX (in BleService): always call after every valid packet.
 */

import {DeviceInfo, RSSIReading, VictimLocation} from '../types/index';

// ── RSSI → Distance ───────────────────────────────────────────────────────────
// Log-distance path loss: d = 10^((txPower - rssi) / (10 * n))
// txPower = -59 dBm at 1 m (standard BLE value)
// n = 2.5  (indoor with moderate obstacles)
function rssiToDistance(rssi: number, txPower = -59, n = 2.5): number {
  const d = Math.pow(10, (txPower - rssi) / (10 * n));
  return Math.max(0.3, Math.min(150, d)); // clamp to [0.3m, 150m]
}

// ── Confidence from reading quality ──────────────────────────────────────────
function readingConfidence(readings: {rssi: number}[]): number {
  if (readings.length === 0) return 0;
  if (readings.length === 1) return 0.25;
  if (readings.length === 2) return 0.45;

  // More readings = higher base confidence
  const base = Math.min(0.95, 0.5 + readings.length * 0.08);

  // Penalise high RSSI variance (noisy signals = less trustworthy)
  const mean = readings.reduce((s, r) => s + r.rssi, 0) / readings.length;
  const variance =
    readings.reduce((s, r) => s + Math.pow(r.rssi - mean, 2), 0) / readings.length;
  const stdDev = Math.sqrt(variance);
  const noisePenalty = Math.min(0.3, stdDev / 30);

  return Math.max(0.1, base - noisePenalty);
}

// ── Proper least-squares trilateration ───────────────────────────────────────
// Linearises the system of N circle equations around the first reference,
// then solves using the normal equations (AᵀA)x = Aᵀb.
function trilaterate(
  refs: {x: number; y: number; distance: number; rssi: number}[],
): {x: number; y: number} {
  const n = refs.length;
  if (n < 2) throw new Error('Need at least 2 refs');

  // Anchor at refs[0] to linearise
  const x0 = refs[0].x, y0 = refs[0].y, d0 = refs[0].distance;

  // Build A (n-1 × 2) and b (n-1 × 1)
  const A: number[][] = [];
  const b: number[]   = [];

  for (let i = 1; i < n; i++) {
    const xi = refs[i].x, yi = refs[i].y, di = refs[i].distance;
    A.push([2 * (xi - x0), 2 * (yi - y0)]);
    b.push(
      di * di - d0 * d0 -
      (xi * xi - x0 * x0) -
      (yi * yi - y0 * y0),
    );
  }

  // Solve Ax = b via normal equations if overdetermined, directly if n-1 === 1
  if (A.length === 1) {
    // Only 2 references — project onto the line between them
    const [a00, a01] = A[0];
    const len2 = a00 * a00 + a01 * a01;
    if (len2 < 1e-9) return {x: x0, y: y0};
    const t = b[0] / len2;
    return {x: x0 + t * a00, y: y0 + t * a01};
  }

  // AᵀA (2×2) and Aᵀb (2×1)
  let ata00 = 0, ata01 = 0, ata11 = 0, atb0 = 0, atb1 = 0;
  for (let i = 0; i < A.length; i++) {
    ata00 += A[i][0] * A[i][0];
    ata01 += A[i][0] * A[i][1];
    ata11 += A[i][1] * A[i][1];
    atb0  += A[i][0] * b[i];
    atb1  += A[i][1] * b[i];
  }

  const det = ata00 * ata11 - ata01 * ata01;
  if (Math.abs(det) < 1e-9) {
    // Singular matrix — fall back to weighted centroid
    return {
      x: refs.reduce((s, r) => s + r.x, 0) / refs.length,
      y: refs.reduce((s, r) => s + r.y, 0) / refs.length,
    };
  }

  return {
    x: (ata11 * atb0 - ata01 * atb1) / det,
    y: (ata00 * atb1 - ata01 * atb0) / det,
  };
}

// ── Zone-based fallback (1–2 references) ─────────────────────────────────────
function zoneBasedPosition(
  refs: {x: number; y: number; distance: number; rssi: number}[],
): {x: number; y: number} {
  if (refs.length === 0) return {x: 0, y: 0};

  if (refs.length === 1) {
    // Place victim along a fixed 45° bearing from the single reference.
    // Arbitrary but consistent — better than returning the reference's own position.
    const d = refs[0].distance;
    const angle = Math.PI / 4; // 45°
    return {
      x: refs[0].x + d * Math.cos(angle),
      y: refs[0].y + d * Math.sin(angle),
    };
  }

  // 2 references — run the 2-point trilaterate (projects onto the connecting line)
  return trilaterate(refs);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Calculate victim positions from RSSI readings.
 *
 * The responder is always placed at (0,0).  Every other device that has
 * at least one RSSI reading to a device whose position is already known
 * gets estimated.  Multiple passes let devices "bootstrap" off each other.
 *
 * @param victims        Map of all known victim DeviceInfo records.
 * @param rssiReadings   Array of RSSI readings between device pairs.
 * @param responderPosition  Responder coordinates (default origin).
 * @param passes         Number of trilateration refinement passes (default 3).
 * @param responderId    The responder's own "RL_XXXXXXXX" device ID.
 *                       REQUIRED for the map to work with only 1 remote device.
 *                       When supplied, this ID is also registered in the `known`
 *                       map at the responder position so that RSSI readings of
 *                       the form {from: responderId, to: victimId} resolve
 *                       correctly in the first pass.
 */
export function calculateVictimLocations(
  victims: Record<string, DeviceInfo>,
  rssiReadings: RSSIReading[],
  responderPosition: {x: number; y: number} = {x: 0, y: 0},
  passes = 3,
  responderId?: string,  // ← FIX v2: responder's own stable RL_ ID
): Record<string, VictimLocation> {
  const locations: Record<string, VictimLocation> = {};

  // Known positions: starts with responder at origin, grows as victims get placed
  const known = new Map<string, {x: number; y: number}>();
  known.set('responder', responderPosition);

  // FIX v2: also register the responder by their actual RL_ device ID.
  // Without this, RSSI readings {from: responderId, to: victimId} can't be
  // resolved because 'responder' !== responderId.
  if (responderId) {
    known.set(responderId, responderPosition);
  }

  // Geometric anchor: place the first victim 10m east of responder so that
  // there is always a second reference point for the second victim, even
  // when the responder is the only "known" device in the first pass.
  const victimIds = Object.keys(victims);
  if (victimIds.length > 0 && !known.has(victimIds[0])) {
    known.set(victimIds[0], {x: 10, y: 0});
  }

  for (let pass = 0; pass < passes; pass++) {
    for (const victimId of victimIds) {
      // Gather all readings where one side is this victim
      const myReadings = rssiReadings.filter(
        r => r.fromDeviceId === victimId || r.toDeviceId === victimId,
      );

      if (myReadings.length === 0) continue;

      // Build reference points from known positions
      const refs: {x: number; y: number; distance: number; rssi: number}[] = [];
      const seen = new Set<string>();

      for (const r of myReadings) {
        const refId = r.fromDeviceId === victimId ? r.toDeviceId : r.fromDeviceId;
        if (seen.has(refId)) continue;
        // Look up in `known` first, then in already-calculated locations
        const pos = known.get(refId) ?? locations[refId];
        if (!pos) continue;
        seen.add(refId);
        refs.push({x: pos.x, y: pos.y, distance: rssiToDistance(r.rssi), rssi: r.rssi});
      }

      if (refs.length === 0) continue;

      let pos: {x: number; y: number};
      if (refs.length >= 2) {
        try {
          pos = trilaterate(refs);
        } catch {
          pos = zoneBasedPosition(refs);
        }
      } else {
        pos = zoneBasedPosition(refs);
      }

      const confidence = readingConfidence(myReadings);
      const distFromOrigin = Math.sqrt(pos.x * pos.x + pos.y * pos.y);

      locations[victimId] = {
        deviceId:   victimId,
        x:          pos.x,
        y:          pos.y,
        confidence,
        distance:   refs[0]?.distance ?? distFromOrigin,
      };

      // Add newly placed victim to known map so subsequent victims can use it
      known.set(victimId, pos);
    }
  }

  return locations;
}

// ── Proximity zone fallback (for UI display when localization is unavailable) ──
export function proximityZoneFallback(
  rssiReadings: RSSIReading[],
): Record<string, {zone: string; confidence: number}> {
  const zones: Record<string, {zone: string; confidence: number}> = {};
  const byDevice: Record<string, number[]> = {};

  for (const r of rssiReadings) {
    (byDevice[r.toDeviceId] = byDevice[r.toDeviceId] ?? []).push(r.rssi);
  }

  for (const [id, vals] of Object.entries(byDevice)) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    zones[id] =
      avg > -65 ? {zone: 'Very Close',          confidence: 0.9} :
      avg > -75 ? {zone: 'Close',               confidence: 0.8} :
      avg > -85 ? {zone: 'Medium',              confidence: 0.6} :
      avg > -95 ? {zone: 'Far',                 confidence: 0.4} :
                  {zone: 'Very Far/Weak Signal', confidence: 0.2};
  }

  return zones;
}

// ── Cross-validation: penalise inconsistent location estimates ────────────────
export function validateLocations(
  locations: Record<string, VictimLocation>,
  rssiReadings: RSSIReading[],
): Record<string, VictimLocation> {
  const result = {...locations};

  for (const r of rssiReadings) {
    const l1 = result[r.fromDeviceId];
    const l2 = result[r.toDeviceId];
    if (!l1 || !l2) continue;

    const measuredDist = Math.sqrt(
      Math.pow(l1.x - l2.x, 2) + Math.pow(l1.y - l2.y, 2),
    );
    const expectedDist = rssiToDistance(r.rssi);
    const error = Math.abs(measuredDist - expectedDist);

    if (error > 20) {
      l1.confidence = Math.max(0, l1.confidence - 0.1);
      l2.confidence = Math.max(0, l2.confidence - 0.1);
    }
  }

  return result;
}