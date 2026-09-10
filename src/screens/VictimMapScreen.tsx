/**
 * src/screens/VictimMapScreen.tsx — FIXED v2
 *
 * CHANGES from v1:
 *
 * FIX 1 – Empty-state message now says "≥1 device" instead of "≥2 devices"
 *   Now that localization.ts v2 registers the responder's own RL_ ID in
 *   the `known` map, a single remote device produces a valid zone-based
 *   position (placed ~10m from origin at 45°).  The old message was
 *   misleading and caused confusion during demos.
 *
 * FIX 2 – Fallback banner for 1-device zone-estimate
 *   When there is exactly 1 located victim with confidence < 0.35 (i.e. it
 *   came from the zone-based fallback, not trilateration), the map now shows
 *   a yellow info banner: "Zone estimate — add more devices for precision."
 *   This makes it clear to the demo audience that the dot position is
 *   approximate, without hiding the device entirely.
 *
 * ARCHITECTURE — how coordinates work:
 *   • No GPS required. Coordinates are relative (meters), origin = responder (0,0).
 *   • calculateVictimLocations() in localization.ts computes (x, y) for each
 *     victim and stores them in appStore.locations.
 *   • This screen reads those locations and renders them on a scaled canvas.
 *   • Confidence < 0.4 → shown with a dashed confidence ring (low trust).
 *   • Zone fallback (1 device) → position is ~10m NE of origin; shown in orange.
 */

import React, {useMemo, useRef, useState} from 'react';
import {
  Dimensions,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {useAppStore} from '../store/appStore';
import {VictimLocation} from '../types/index';

const {width: SCREEN_W} = Dimensions.get('window');
const MAP_SIZE = SCREEN_W - 32; // square map, 16px margin each side

// ── helpers ────────────────────────────────────────────────────────────────

/** Convert world-space metres to SVG pixels given scale and pan. */
function worldToSvg(
  wx: number,
  wy: number,
  scale: number,
  panX: number,
  panY: number,
  center: number,
) {
  return {
    sx: center + wx * scale + panX,
    sy: center - wy * scale + panY, // y-axis flipped (screen coords)
  };
}

/** Bounding box of all locations (for auto-fit). */
function boundingBox(locs: VictimLocation[]) {
  if (locs.length === 0) return {minX: -10, maxX: 10, minY: -10, maxY: 10};
  const xs = locs.map(l => l.x);
  const ys = locs.map(l => l.y);
  return {
    minX: Math.min(...xs, 0) - 5,
    maxX: Math.max(...xs, 0) + 5,
    minY: Math.min(...ys, 0) - 5,
    maxY: Math.max(...ys, 0) + 5,
  };
}

/** Auto-compute scale so all victims fit in MAP_SIZE. */
function autoScale(locs: VictimLocation[]): number {
  const bb = boundingBox(locs);
  const spanX = bb.maxX - bb.minX;
  const spanY = bb.maxY - bb.minY;
  const span = Math.max(spanX, spanY, 20); // minimum 20m viewport
  return (MAP_SIZE * 0.8) / span;
}

function confidenceColor(c: number): string {
  if (c >= 0.75) return '#44FF44'; // green  – trilateration with 3+ refs
  if (c >= 0.5)  return '#FFAA00'; // amber  – trilateration with 2 refs
  if (c >= 0.3)  return '#FF6600'; // orange – zone fallback (1 device)
  return '#FF3333';                  // red    – very uncertain
}

// ── component ──────────────────────────────────────────────────────────────

const VictimMapScreen: React.FC = ({navigation}: any) => {
  const {locations, victims, rssiReadings, deviceId} = useAppStore();

  const locationList: VictimLocation[] = useMemo(
    () => Object.values(locations),
    [locations],
  );

  const scale  = useMemo(() => autoScale(locationList), [locationList]);
  const center = MAP_SIZE / 2;

  // Pan state
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panStart = useRef({x: 0, y: 0});

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      panStart.current = {x: panX, y: panY};
    },
    onPanResponderMove: (_, gs) => {
      setPanX(panStart.current.x + gs.dx);
      setPanY(panStart.current.y + gs.dy);
    },
  });

  const resetView = () => {setPanX(0); setPanY(0);};

  // Responder node is always at world-origin (0,0)
  const responderSvg = worldToSvg(0, 0, scale, panX, panY, center);

  // RSSI links — only between located victims
  const links = useMemo(() => {
    return rssiReadings
      .filter(r => locations[r.fromDeviceId] && locations[r.toDeviceId])
      .map(r => ({
        from: locations[r.fromDeviceId],
        to:   locations[r.toDeviceId],
        rssi: r.rssi,
      }));
  }, [rssiReadings, locations]);

  // FIX 2: detect pure zone-fallback scenario (1 device, very low confidence)
  const isZoneFallback =
    locationList.length === 1 && locationList[0].confidence < 0.35;

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>VICTIM MAP</Text>
        <TouchableOpacity onPress={resetView}>
          <Text style={styles.resetBtn}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* FIX 2: Zone-fallback banner */}
      {isZoneFallback && (
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackIcon}>⚠️</Text>
          <Text style={styles.fallbackText}>
            Zone estimate — position is approximate (~10 m radius).
            Add more devices for precision trilateration.
          </Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, {backgroundColor: '#FF4444'}]} />
          <Text style={styles.legendText}>You (Responder)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, {backgroundColor: '#44FF44'}]} />
          <Text style={styles.legendText}>High conf</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, {backgroundColor: '#FF6600'}]} />
          <Text style={styles.legendText}>Zone est.</Text>
        </View>
      </View>

      {/* Map canvas */}
      <View style={styles.mapContainer} {...panResponder.panHandlers}>
        <Svg width={MAP_SIZE} height={MAP_SIZE}>
          <Defs>
            <RadialGradient id="respGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#FF4444" stopOpacity="0.9" />
              <Stop offset="100%" stopColor="#FF0000" stopOpacity="0.3" />
            </RadialGradient>
          </Defs>

          {/* Grid lines every 10 m */}
          {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map(m => {
            const {sx} = worldToSvg(m, 0, scale, panX, panY, center);
            const {sy} = worldToSvg(0, m, scale, panX, panY, center);
            return (
              <G key={m}>
                <Line x1={sx} y1={0} x2={sx} y2={MAP_SIZE}
                  stroke="#333" strokeWidth="0.5" strokeDasharray="4,4" />
                <Line x1={0} y1={sy} x2={MAP_SIZE} y2={sy}
                  stroke="#333" strokeWidth="0.5" strokeDasharray="4,4" />
                {m !== 0 && (
                  <SvgText x={sx + 2} y={center + panY - 2}
                    fill="#555" fontSize="8">{m}m</SvgText>
                )}
              </G>
            );
          })}

          {/* Axes */}
          <Line x1={center + panX} y1={0} x2={center + panX} y2={MAP_SIZE}
            stroke="#555" strokeWidth="1" />
          <Line x1={0} y1={center + panY} x2={MAP_SIZE} y2={center + panY}
            stroke="#555" strokeWidth="1" />

          {/* RSSI links */}
          {links.map((link, i) => {
            const a = worldToSvg(link.from.x, link.from.y, scale, panX, panY, center);
            const b = worldToSvg(link.to.x,   link.to.y,   scale, panX, panY, center);
            const opacity = Math.max(0.1, Math.min(0.6, (link.rssi + 100) / 60));
            return (
              <Line key={i}
                x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
                stroke="#FF8800" strokeWidth="1"
                strokeDasharray={link.rssi < -80 ? '4,4' : undefined}
                opacity={opacity}
              />
            );
          })}

          {/* Victim nodes */}
          {locationList.map(loc => {
            const {sx, sy} = worldToSvg(loc.x, loc.y, scale, panX, panY, center);
            const color    = confidenceColor(loc.confidence);
            const label    = loc.deviceId.slice(-6);
            const isLow    = loc.confidence < 0.4;
            const radius   = 10;

            return (
              <G key={loc.deviceId}>
                {/* Confidence ring — dashed when low */}
                <Circle cx={sx} cy={sy}
                  r={radius + 6}
                  fill="transparent"
                  stroke={color}
                  strokeWidth="1"
                  strokeDasharray={isLow ? '3,3' : undefined}
                  opacity={0.5}
                />
                {/* FIX 2: zone-estimate pulse ring */}
                {isZoneFallback && (
                  <Circle cx={sx} cy={sy}
                    r={radius + 20}
                    fill="transparent"
                    stroke="#FF6600"
                    strokeWidth="0.5"
                    strokeDasharray="6,6"
                    opacity={0.25}
                  />
                )}
                {/* Main node */}
                <Circle cx={sx} cy={sy} r={radius}
                  fill={color} opacity={0.85} />
                {/* Label */}
                <SvgText x={sx} y={sy + radius + 14}
                  fill="#FFF" fontSize="9" textAnchor="middle" fontWeight="600">
                  {label}
                </SvgText>
                <SvgText x={sx} y={sy + radius + 24}
                  fill="#AAA" fontSize="8" textAnchor="middle">
                  {Math.round(loc.distance)}m · {Math.round(loc.confidence * 100)}%
                  {isZoneFallback ? ' (zone)' : ''}
                </SvgText>
              </G>
            );
          })}

          {/* Responder (origin) */}
          <Circle cx={responderSvg.sx} cy={responderSvg.sy}
            r={14} fill="url(#respGrad)" />
          <SvgText x={responderSvg.sx} y={responderSvg.sy + 5}
            fill="#FFF" fontSize="10" textAnchor="middle" fontWeight="700">
            YOU
          </SvgText>
          <SvgText x={responderSvg.sx} y={responderSvg.sy + 28}
            fill="#FF4444" fontSize="9" textAnchor="middle">
            Responder
          </SvgText>
        </Svg>
      </View>

      {/* Victim list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.listHeader}>
          {locationList.length} VICTIM{locationList.length !== 1 ? 'S' : ''} LOCATED
        </Text>

        {/* FIX 1: empty-state now says ≥1 device */}
        {locationList.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No victim positions yet.</Text>
            <Text style={styles.emptySubtext}>
              A position appears as soon as{'\n'}
              at least one nearby device is detected.{'\n'}
              Make sure the other phone is in Victim Mode and close by.
            </Text>
          </View>
        ) : (
          locationList
            .sort((a, b) => b.confidence - a.confidence)
            .map(loc => (
              <View key={loc.deviceId} style={styles.victimRow}>
                <View style={[styles.confBar,
                  {backgroundColor: confidenceColor(loc.confidence)}]} />
                <View style={styles.victimInfo}>
                  <Text style={styles.victimId}>{loc.deviceId}</Text>
                  <Text style={styles.victimCoords}>
                    x={loc.x.toFixed(1)}m  y={loc.y.toFixed(1)}m
                    {'  '}~{Math.round(loc.distance)}m away
                  </Text>
                  {loc.confidence < 0.35 && (
                    <Text style={styles.zoneTag}>⚠ Zone estimate (low precision)</Text>
                  )}
                </View>
                <View style={styles.confBadge}>
                  <Text style={[styles.confValue,
                    {color: confidenceColor(loc.confidence)}]}>
                    {Math.round(loc.confidence * 100)}%
                  </Text>
                  <Text style={styles.confLabel}>conf</Text>
                </View>
              </View>
            ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      {flex: 1, backgroundColor: '#1a1a1a'},
  header:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#2a2a2a',
    borderBottomColor: '#444', borderBottomWidth: 1,
  },
  back:           {color: '#FF8800', fontSize: 14},
  title:          {color: '#FF8800', fontSize: 16, fontWeight: '700', letterSpacing: 1},
  resetBtn:       {color: '#AAA', fontSize: 14},

  // FIX 2: zone-fallback banner
  fallbackBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#332200', borderBottomColor: '#FF8800', borderBottomWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  fallbackIcon:   {fontSize: 16},
  fallbackText:   {color: '#FFAA00', fontSize: 11, flex: 1, lineHeight: 16},

  legend:         {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#222', gap: 16,
  },
  legendItem:     {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot:            {width: 10, height: 10, borderRadius: 5},
  legendText:     {color: '#AAA', fontSize: 11},

  mapContainer:   {
    width: MAP_SIZE, height: MAP_SIZE,
    alignSelf: 'center', marginTop: 12,
    backgroundColor: '#111', borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#333', borderWidth: 1,
  },

  list:           {flex: 1, marginTop: 12},
  listContent:    {paddingHorizontal: 16, paddingBottom: 24},
  listHeader:     {
    color: '#FF8800', fontSize: 11, fontWeight: '700',
    letterSpacing: 1, marginBottom: 8,
  },

  emptyBox:       {
    backgroundColor: '#2a2a2a', borderRadius: 10, padding: 16,
    alignItems: 'center',
  },
  emptyText:      {color: '#888', fontSize: 13, marginBottom: 6},
  emptySubtext:   {color: '#555', fontSize: 11, textAlign: 'center', lineHeight: 16},

  victimRow:      {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2a2a2a', borderRadius: 10,
    marginBottom: 8, overflow: 'hidden',
  },
  confBar:        {width: 4, alignSelf: 'stretch'},
  victimInfo:     {flex: 1, padding: 12},
  victimId:       {color: '#FFF', fontSize: 12, fontWeight: '600', marginBottom: 3},
  victimCoords:   {color: '#888', fontSize: 11, fontFamily: 'monospace'},
  zoneTag:        {color: '#FF8800', fontSize: 10, marginTop: 4, fontStyle: 'italic'},

  confBadge:      {alignItems: 'center', paddingHorizontal: 14},
  confValue:      {fontSize: 16, fontWeight: '700'},
  confLabel:      {color: '#555', fontSize: 10},
});

export default VictimMapScreen;