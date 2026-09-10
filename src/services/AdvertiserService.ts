/**
 * src/services/AdvertiserService.ts — FIXED v2
 *
 * FIX: Oppo/ColorOS "not authorized" after USB unplug
 *   ColorOS revokes BLUETOOTH_ADVERTISE at runtime when transitioning from
 *   USB-debug mode to standalone mode. The previous code had no permission
 *   check inside _doStart(), so after unplug:
 *     1. startAdvertising() called → OS throws "not authorized"
 *     2. catch sets this.advertising = false
 *     3. _doRefresh() timer fires → calls stopAdvertising() (no-op) then
 *        _doStart() again → same error → infinite silent failure loop
 *     4. Device disappears from all scanners
 *
 *   Fix A: Re-request BLUETOOTH_ADVERTISE before every _doStart() call.
 *     PermissionsAndroid.request() is idempotent — if already granted it
 *     returns immediately. On Oppo, the re-grant dialog appears once after
 *     unplug and the user taps Allow → advertising resumes.
 *
 *   Fix B: 5-second auto-retry on failure so transient errors recover
 *     without user intervention.
 *
 *   Fix C: Exponential backoff cap (max 30s) to avoid spamming retries.
 */

import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { RESCUELINK_SERVICE_UUID } from '../utils/bleUUIDs';
import { AggregatedPacket } from '../types/index';

const { BleAdvertiser } = NativeModules;

const DISASTER_FLAG = 0xff;
const NORMAL_FLAG   = 0x01;

const REFRESH_MS    = 4000;  // re-advertise packet every 4s (keeps data fresh)
const RETRY_BASE_MS = 5000;  // first retry after 5s
const RETRY_MAX_MS  = 30000; // cap at 30s

export class AdvertiserService {
  private advertising    = false;
  private disasterMode   = false;
  private currentPacket: AggregatedPacket | null = null;
  private refreshTimer:  ReturnType<typeof setInterval>  | null = null;
  private retryTimer:    ReturnType<typeof setTimeout>   | null = null;
  private retryDelayMs   = RETRY_BASE_MS;

  // ── lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (!BleAdvertiser) {
      console.warn('[AdvertiserService] BleAdvertiser native module not found.');
    } else {
      console.log('[AdvertiserService] ✅ Native module found');
    }
  }

  async startAdvertising(packet: AggregatedPacket, isDisaster = false): Promise<void> {
    this.currentPacket = packet;
    this.disasterMode  = isDisaster;

    if (this.advertising) return;

    this._clearRetry();
    await this._doStart();

    // Periodic refresh so the payload stays current as victims are added
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this._doRefresh(), REFRESH_MS);
  }

  async broadcastDisasterAlert(packet: AggregatedPacket): Promise<void> {
    console.log('[AdvertiserService] 🚨 Disaster mode');
    this.disasterMode  = true;
    this.currentPacket = packet;
    if (this.advertising) {
      await this._doRefresh();
    } else {
      await this.startAdvertising(packet, true);
    }
  }

  async stopAdvertising(): Promise<void> {
    this._clearRetry();
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (!this.advertising || !BleAdvertiser) { this.advertising = false; return; }
    try {
      await BleAdvertiser.stopAdvertising();
      console.log('[AdvertiserService] 🛑 Stopped');
    } catch (e: any) {
      console.warn('[AdvertiserService] stop error (non-fatal):', e?.message);
    } finally {
      this.advertising  = false;
      this.disasterMode = false;
    }
  }

  async destroy(): Promise<void> {
    await this.stopAdvertising();
  }

  get isAdvertising() { return this.advertising; }

  // ── core start/refresh ─────────────────────────────────────────────────────

  /**
   * FIX A: Re-request BLUETOOTH_ADVERTISE every time we try to start.
   * On Oppo this triggers the OS grant dialog if the permission was revoked.
   */
  private async _doStart(): Promise<void> {
    if (!BleAdvertiser || Platform.OS !== 'android') return;

    // ── Permission check (Oppo/ColorOS fix) ──────────────────────────────────
    if ((Platform.Version as number) >= 31) {
      try {
        const perm = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        );
        if (perm !== PermissionsAndroid.RESULTS.GRANTED) {
          console.error(
            '[AdvertiserService] BLUETOOTH_ADVERTISE denied — scheduling retry in',
            this.retryDelayMs / 1000, 's'
          );
          this._scheduleRetry();
          return; // bail gracefully; scanning still works
        }
      } catch (permErr: any) {
        console.warn('[AdvertiserService] Permission check error:', permErr?.message);
        // Don't abort — some ROM versions throw here but advertising still works
      }
    }

    // ── Actual advertise call ─────────────────────────────────────────────────
    try {
      const mfrBytes = this._buildManufacturerBytes();
      await BleAdvertiser.startAdvertising(RESCUELINK_SERVICE_UUID, mfrBytes);
      this.advertising   = true;
      this.retryDelayMs  = RETRY_BASE_MS; // reset backoff on success
      console.log(
        `[AdvertiserService] 📡 Advertising | disaster=${this.disasterMode}` +
        ` | victims=${this.currentPacket?.victims?.length ?? 0}`
      );
    } catch (e: any) {
      console.error('[AdvertiserService] startAdvertising failed:', e?.message);
      this.advertising = false;
      // FIX B: auto-retry with exponential backoff
      this._scheduleRetry();
    }
  }

  private async _doRefresh(): Promise<void> {
    if (!BleAdvertiser || !this.currentPacket) return;
    try {
      await BleAdvertiser.stopAdvertising();
      this.advertising = false;
      await this._doStart();
    } catch (e: any) {
      console.warn('[AdvertiserService] refresh error:', e?.message);
      this.advertising = false;
      this._scheduleRetry();
    }
  }

  // ── retry helpers ──────────────────────────────────────────────────────────

  /** FIX B+C: schedule auto-retry with exponential backoff capped at 30s. */
  private _scheduleRetry(): void {
    this._clearRetry();
    console.log(`[AdvertiserService] ⏳ Retry in ${this.retryDelayMs / 1000}s`);
    this.retryTimer = setTimeout(async () => {
      if (!this.advertising) {
        console.log('[AdvertiserService] 🔄 Retrying advertising...');
        await this._doStart();
      }
    }, this.retryDelayMs);
    // Exponential backoff: 5s → 10s → 20s → 30s (cap)
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, RETRY_MAX_MS);
  }

  private _clearRetry(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  // ── packet builder ─────────────────────────────────────────────────────────

  /**
   * Only 3 bytes of manufacturer data.
   *
   * Android BLE advertisement packets have a hard 31-byte limit total, shared
   * between the service UUID (16 bytes for 128-bit UUID + 2 byte overhead = 18),
   * the manufacturer data header (4 bytes: length + type + 2-byte company ID),
   * and our actual data bytes.
   *
   * Budget: 31 - 18 - 4 = 9 bytes max for our data.
   * We use only 3 bytes to stay well clear of the limit.
   *
   * Full packet data is delivered via GATT connect+read, not advertisement.
   *
   * Raw layout seen by remote scanner (OS prepends 2-byte company ID):
   *   [0x59, 0x00,  flag,  victimCount,  battery]
   *    ^^^^^^^^^^^  ^^^^   ^^^^^^^^^^^   ^^^^^^^
   *    company ID   [2]       [3]          [4]
   *
   * Existing disaster check: mfrData[2] === 0xFF → still works ✅
   */
  private _buildManufacturerBytes(): number[] {
    return [
      this.disasterMode ? DISASTER_FLAG : NORMAL_FLAG,          // → mfrData[2]
      Math.min(255, this.currentPacket?.victims?.length ?? 0),  // → mfrData[3]
      this.currentPacket?.victims?.[0]?.battery ?? 100,         // → mfrData[4]
    ];
  }
}