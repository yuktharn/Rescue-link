/**
 * src/utils/aggregation.ts — FIXED
 *
 * BUGS FIXED (device count dropping below 10):
 *
 * FIX 1 – addRSSIReading timestamp never refreshed
 *   Old code only updated an RSSI entry if the NEW reading was STRONGER. So a
 *   device that drifted even 1 dBm weaker never had its timestamp refreshed.
 *   After 5 minutes, pruneAggregationState() silently deleted the entry even
 *   though the device was still in range. Count dropped.
 *   → Now: always refresh timestamp on every sighting; only keep stronger RSSI
 *     value for localization quality.
 *
 * FIX 2 – addVictim timestamp not refreshed for re-sightings
 *   Timestamps from deserialized packets are (seconds × 1000), so two packets
 *   arriving within the same second get identical timestamps. The guard
 *   `victim.timestamp > existing.timestamp` skipped the update, leaving the
 *   stored timestamp frozen at first-sight time.  Five minutes later → pruned.
 *   → Now: always stamp with wall-clock currentTime so the entry is always
 *     fresh as long as we keep seeing the device.
 *
 * FIX 3 – A↔B / B↔A RSSI pairs stored as duplicate keys
 *   "dev1-dev2" and "dev2-dev1" were two separate map entries consuming double
 *   space and confusing the localization algorithm.
 *   → Now: key is always sorted lexicographically so it's canonical.
 *
 * FIX 4 – buildAggregatedPacket never pruned before building
 *   If the caller forgot to call pruneAggregationState(), stale victims
 *   accumulated indefinitely and then fell off in one large batch.
 *   → Now: always prune inline at build time.
 */

import {DeviceInfo, RSSIReading, AggregatedPacket} from '../types/index';

const MAX_VICTIMS_PER_AGGREGATION = 20;
const MAX_RSSI_READINGS_PER_AGGREGATION = 50;
const STALE_DATA_THRESHOLD = 10 * 60 * 1000; // 10 min (was 5; safety net after fix)

interface AggregationState {
  victims: Map<string, DeviceInfo>;
  rssiReadings: Map<string, RSSIReading>;
  sequenceNumber: number;
}

export function createAggregationState(): AggregationState {
  return {victims: new Map(), rssiReadings: new Map(), sequenceNumber: 0};
}

/**
 * Add / refresh a victim.
 * FIX 2: Always stamp with wall-clock time so timestamp never freezes.
 */
export function addVictim(
  state: AggregationState,
  victim: DeviceInfo,
  currentTime: number = Date.now(),
): void {
  const existing = state.victims.get(victim.deviceId);

  if (!existing) {
    state.victims.set(victim.deviceId, {...victim, timestamp: currentTime});
    console.log(`[Aggregation] ➕ New victim: ${victim.deviceId} | total: ${state.victims.size}`);
    return;
  }

  // Prefer newer packet data but ALWAYS refresh the wall-clock timestamp.
  const useNewData = victim.timestamp >= existing.timestamp;
  state.victims.set(victim.deviceId, {
    deviceId:  victim.deviceId,
    status:    useNewData ? victim.status   : existing.status,
    battery:   useNewData ? victim.battery  : existing.battery,
    hopCount:  useNewData ? victim.hopCount : existing.hopCount,
    timestamp: currentTime, // ✅ FIX 2
  });
}

/**
 * Add / refresh an RSSI reading.
 * FIX 1: Always refresh timestamp; keep stronger RSSI for quality.
 * FIX 3: Canonical key (sorted) eliminates A↔B duplicates.
 */
export function addRSSIReading(
  state: AggregationState,
  reading: RSSIReading,
  currentTime: number = Date.now(),
): void {
  // FIX 3: canonical key
  const [a, b] = [reading.fromDeviceId, reading.toDeviceId].sort();
  const key = `${a}-${b}`;

  const existing = state.rssiReadings.get(key);
  state.rssiReadings.set(key, {
    fromDeviceId: a,
    toDeviceId:   b,
    // Keep stronger signal for localization; always refresh timestamp
    rssi:      existing ? Math.max(existing.rssi, reading.rssi) : reading.rssi,
    hopCount:  reading.hopCount,
    timestamp: currentTime, // ✅ FIX 1
  });
}

export function mergeVictims(
  state: AggregationState,
  newVictims: DeviceInfo[],
  currentTime: number = Date.now(),
): void {
  for (const victim of newVictims) {
    addVictim(state, victim, currentTime);
  }
}

export function mergeRSSIReadings(
  state: AggregationState,
  newReadings: RSSIReading[],
  currentTime: number = Date.now(),
): void {
  for (const reading of newReadings) {
    addRSSIReading(state, reading, currentTime);
  }
}

/**
 * Prune genuinely stale entries (not seen for STALE_DATA_THRESHOLD).
 */
export function pruneAggregationState(
  state: AggregationState,
  currentTime: number = Date.now(),
): void {
  let pv = 0, pr = 0;
  for (const [id, v] of state.victims) {
    if (currentTime - v.timestamp > STALE_DATA_THRESHOLD) {
      state.victims.delete(id); pv++;
    }
  }
  for (const [key, r] of state.rssiReadings) {
    if (currentTime - r.timestamp > STALE_DATA_THRESHOLD) {
      state.rssiReadings.delete(key); pr++;
    }
  }
  if (pv > 0 || pr > 0) {
    console.log(
      `[Aggregation] 🗑️ Pruned ${pv} victims, ${pr} RSSI | ` +
      `remaining: ${state.victims.size} victims, ${state.rssiReadings.size} readings`,
    );
  }
}

/**
 * Build the broadcast packet.
 * FIX 4: Always prune first so stale entries never appear in the output.
 */
export function buildAggregatedPacket(
  state: AggregationState,
  advertiserId: string,
  currentTime: number = Date.now(),
): AggregatedPacket {
  pruneAggregationState(state, currentTime); // ✅ FIX 4

  const freshVictims  = Array.from(state.victims.values());
  const freshReadings = Array.from(state.rssiReadings.values())
    .sort((a, b) => b.rssi - a.rssi); // strongest first

  const victims     = freshVictims.slice(0, MAX_VICTIMS_PER_AGGREGATION);
  const rssiReadings = freshReadings.slice(0, MAX_RSSI_READINGS_PER_AGGREGATION);

  state.sequenceNumber = (state.sequenceNumber + 1) % 65536;

  console.log(
    `[Aggregation] 📦 Packet: ${victims.length} victims, ${rssiReadings.length} RSSI readings`,
  );

  return {
    advertiserId,
    victims,
    rssiReadings,
    sequenceNumber: state.sequenceNumber,
    timestamp: currentTime,
    chunkIndex: 0,
    totalChunks: 1,
  };
}

export function estimateAggregationSize(state: AggregationState): number {
  return 30 + state.victims.size * 20 + state.rssiReadings.size * 25;
}

export function getAggregationStats(state: AggregationState): {
  victimCount: number;
  rssiReadingCount: number;
  estimatedBytes: number;
  status: string;
} {
  const estimatedBytes   = estimateAggregationSize(state);
  const victimCount      = state.victims.size;
  const rssiReadingCount = state.rssiReadings.size;

  let status = 'OK';
  if (estimatedBytes   > 512) status = 'WARN: Over size limit';
  if (victimCount      > MAX_VICTIMS_PER_AGGREGATION)      status = 'WARN: Over victim limit';
  if (rssiReadingCount > MAX_RSSI_READINGS_PER_AGGREGATION) status = 'WARN: Over RSSI limit';

  return {victimCount, rssiReadingCount, estimatedBytes, status};
}