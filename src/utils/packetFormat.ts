/**
 * Binary packet serialization — FIXED
 *
 * BUG FIXED: "value" argument is out of bounds
 *   buffer.writeUInt32BE(device.timestamp, ...) was receiving Date.now() which
 *   returns milliseconds since epoch (~1 748 000 000 000) — a 13-digit number.
 *   UInt32 max is 4 294 967 295 (10 digits). Writing a larger value throws:
 *   RangeError: "value" argument is out of bounds.
 *
 *   FIX: store timestamp as UNIX SECONDS (divide by 1000) so it fits in UInt32
 *   until year 2106. Deserializer multiplies back by 1000 to restore ms.
 */

import {DeviceInfo, RSSIReading, AggregatedPacket} from '../types/index';
import {Buffer} from 'buffer';

const MAGIC_BYTE = 0xab;
const VERSION = 0x01;
const MAX_PACKET_SIZE = 512;
const MAX_VICTIMS_PER_PACKET = 20;
const MAX_RSSI_READINGS_PER_PACKET = 50;

interface SerializedPacket {
  buffer: Buffer;
  size: number;
}

function serializeDeviceInfo(device: DeviceInfo): Buffer {
  const idBuffer = Buffer.from(device.deviceId, 'utf8');
  const size = 1 + idBuffer.length + 1 + 1 + 4;
  const buffer = Buffer.alloc(size);
  let offset = 0;

  buffer.writeUInt8(idBuffer.length, offset); offset += 1;
  idBuffer.copy(buffer, offset); offset += idBuffer.length;
  buffer.writeUInt8(device.status, offset); offset += 1;
  buffer.writeUInt8(Math.min(255, Math.max(0, device.battery)), offset); offset += 1;
  // ✅ FIX: convert ms → seconds before writing to avoid UInt32 overflow
  const timestampSeconds = Math.floor(device.timestamp / 1000);
  buffer.writeUInt32BE(timestampSeconds >>> 0, offset); offset += 4;

  return buffer;
}

function deserializeDeviceInfo(buffer: Buffer, offset: number): {device: DeviceInfo; bytesRead: number} {
  let pos = offset;
  const idLength = buffer.readUInt8(pos); pos += 1;
  const deviceId = buffer.toString('utf8', pos, pos + idLength); pos += idLength;
  const status = buffer.readUInt8(pos); pos += 1;
  const battery = buffer.readUInt8(pos); pos += 1;
  const timestampSeconds = buffer.readUInt32BE(pos); pos += 4;
  // ✅ FIX: restore ms from seconds
  const timestamp = timestampSeconds * 1000;
  return {device: {deviceId, status, battery, timestamp}, bytesRead: pos - offset};
}

function serializeRSSIReading(reading: RSSIReading): Buffer {
  const fromIdBuffer = Buffer.from(reading.fromDeviceId, 'utf8');
  const toIdBuffer = Buffer.from(reading.toDeviceId, 'utf8');
  const size = 1 + fromIdBuffer.length + 1 + toIdBuffer.length + 1 + 4 + 1;
  const buffer = Buffer.alloc(size);
  let offset = 0;

  buffer.writeUInt8(fromIdBuffer.length, offset); offset += 1;
  fromIdBuffer.copy(buffer, offset); offset += fromIdBuffer.length;
  buffer.writeUInt8(toIdBuffer.length, offset); offset += 1;
  toIdBuffer.copy(buffer, offset); offset += toIdBuffer.length;
  // RSSI is negative (-100 to 0), store as unsigned by adding 128
  buffer.writeUInt8((reading.rssi + 128) & 0xff, offset); offset += 1;
  // ✅ FIX: timestamp as seconds
  const tsSeconds = Math.floor(reading.timestamp / 1000);
  buffer.writeUInt32BE(tsSeconds >>> 0, offset); offset += 4;
  buffer.writeUInt8(Math.min(255, reading.hopCount), offset); offset += 1;

  return buffer;
}

function deserializeRSSIReading(buffer: Buffer, offset: number): {reading: RSSIReading; bytesRead: number} {
  let pos = offset;
  const fromIdLength = buffer.readUInt8(pos); pos += 1;
  const fromDeviceId = buffer.toString('utf8', pos, pos + fromIdLength); pos += fromIdLength;
  const toIdLength = buffer.readUInt8(pos); pos += 1;
  const toDeviceId = buffer.toString('utf8', pos, pos + toIdLength); pos += toIdLength;
  const rssi = buffer.readUInt8(pos) - 128; pos += 1;
  const tsSeconds = buffer.readUInt32BE(pos); pos += 4;
  const timestamp = tsSeconds * 1000; // ✅ restore ms
  const hopCount = buffer.readUInt8(pos); pos += 1;
  return {reading: {fromDeviceId, toDeviceId, rssi, timestamp, hopCount}, bytesRead: pos - offset};
}

export function serializePacket(packet: AggregatedPacket): SerializedPacket {
  const advertiserIdBuffer = Buffer.from(packet.advertiserId, 'utf8');
  const victimBuffers = packet.victims.slice(0, MAX_VICTIMS_PER_PACKET).map(serializeDeviceInfo);
  const rssiBuffers = packet.rssiReadings.slice(0, MAX_RSSI_READINGS_PER_PACKET).map(serializeRSSIReading);

  let totalSize =
    1 + 1 + // magic + version
    1 + advertiserIdBuffer.length + // advertiser id
    1 + 2 + 2 + 4 + 1 + 1 + // victimCount + rssiCount + seq + ts + chunkIdx + totalChunks
    victimBuffers.reduce((s, b) => s + b.length, 0) +
    rssiBuffers.reduce((s, b) => s + b.length, 0);

  if (totalSize > MAX_PACKET_SIZE) {
    console.warn(`[PacketFormat] Packet ${totalSize}b exceeds max ${MAX_PACKET_SIZE}b, truncating`);
  }

  const buffer = Buffer.alloc(Math.min(totalSize, MAX_PACKET_SIZE));
  let offset = 0;

  buffer.writeUInt8(MAGIC_BYTE, offset); offset += 1;
  buffer.writeUInt8(VERSION, offset); offset += 1;
  buffer.writeUInt8(advertiserIdBuffer.length, offset); offset += 1;
  advertiserIdBuffer.copy(buffer, offset); offset += advertiserIdBuffer.length;
  buffer.writeUInt8(victimBuffers.length, offset); offset += 1;
  buffer.writeUInt16BE(rssiBuffers.length, offset); offset += 2;
  buffer.writeUInt16BE(packet.sequenceNumber & 0xffff, offset); offset += 2;
  // ✅ FIX: packet timestamp as seconds
  const packetTsSeconds = Math.floor(packet.timestamp / 1000);
  buffer.writeUInt32BE(packetTsSeconds >>> 0, offset); offset += 4;
  buffer.writeUInt8(packet.chunkIndex & 0xff, offset); offset += 1;
  buffer.writeUInt8(packet.totalChunks & 0xff, offset); offset += 1;

  for (const vb of victimBuffers) {
    if (offset + vb.length > buffer.length) break;
    vb.copy(buffer, offset); offset += vb.length;
  }
  for (const rb of rssiBuffers) {
    if (offset + rb.length > buffer.length) break;
    rb.copy(buffer, offset); offset += rb.length;
  }

  return {buffer, size: offset};
}

export function deserializePacket(buffer: Buffer): AggregatedPacket | null {
  if (buffer.length < 10) {
    console.warn('[PacketFormat] Buffer too short:', buffer.length);
    return null;
  }
  let offset = 0;

  const magic = buffer.readUInt8(offset); offset += 1;
  if (magic !== MAGIC_BYTE) {
    console.warn(`[PacketFormat] Bad magic: 0x${magic.toString(16)}`);
    return null;
  }
  const version = buffer.readUInt8(offset); offset += 1;
  if (version !== VERSION) {
    console.warn(`[PacketFormat] Bad version: ${version}`);
    return null;
  }

  const advertiserIdLength = buffer.readUInt8(offset); offset += 1;
  if (offset + advertiserIdLength > buffer.length) return null;
  const advertiserId = buffer.toString('utf8', offset, offset + advertiserIdLength);
  offset += advertiserIdLength;

  const victimCount = buffer.readUInt8(offset); offset += 1;
  const rssiCount = buffer.readUInt16BE(offset); offset += 2;
  const sequenceNumber = buffer.readUInt16BE(offset); offset += 2;
  // ✅ restore ms from seconds
  const timestampSeconds = buffer.readUInt32BE(offset); offset += 4;
  const timestamp = timestampSeconds * 1000;
  const chunkIndex = buffer.readUInt8(offset); offset += 1;
  const totalChunks = buffer.readUInt8(offset); offset += 1;

  const victims: DeviceInfo[] = [];
  for (let i = 0; i < victimCount && offset < buffer.length; i++) {
    const {device, bytesRead} = deserializeDeviceInfo(buffer, offset);
    victims.push(device);
    offset += bytesRead;
  }

  const rssiReadings: RSSIReading[] = [];
  for (let i = 0; i < rssiCount && offset < buffer.length; i++) {
    const {reading, bytesRead} = deserializeRSSIReading(buffer, offset);
    rssiReadings.push(reading);
    offset += bytesRead;
  }

  return {advertiserId, victims, rssiReadings, sequenceNumber, timestamp, chunkIndex, totalChunks};
}

export function chunkPacket(packet: AggregatedPacket, chunkSize: number = 512): AggregatedPacket[] {
  const chunks: AggregatedPacket[] = [];
  const itemsPerChunk = Math.max(1, Math.floor(chunkSize / 50));

  for (let i = 0; i < Math.max(1, packet.victims.length); i += itemsPerChunk) {
    chunks.push({
      ...packet,
      victims: packet.victims.slice(i, i + itemsPerChunk),
      rssiReadings: packet.rssiReadings.slice(i * 2, (i + itemsPerChunk) * 2),
      chunkIndex: chunks.length,
      totalChunks: Math.ceil(Math.max(1, packet.victims.length) / itemsPerChunk),
    });
  }
  return chunks;
}

export function bufferToHex(buffer: Buffer): string {
  return buffer.toString('hex').toUpperCase();
}

export function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}