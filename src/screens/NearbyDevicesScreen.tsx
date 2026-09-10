/**
 * NearbyDevicesScreen — FIXED v2
 *
 * PROBLEM: This screen was subscribed to `nearbyDevices` from the store.
 * Before the store throttle fix, this caused a re-render on every single BLE
 * advertisement. Even WITH the store throttle, the renderItem function was
 * recreated on every render because it wasn't memoized — FlatList then
 * re-rendered every row, multiplying the work.
 *
 * FIXES:
 * 1. renderItem wrapped in useCallback so FlatList can bail out of row re-renders.
 * 2. Device list filtered/sorted only when nearbyDevices reference changes
 *    (useMemo) instead of on every render.
 * 3. Removed the useEffect+setState pattern for sortedDevices — it caused a
 *    double render (effect runs AFTER render, sets state, triggers another render).
 *    Now computed inline with useMemo — single render path.
 * 4. RefreshControl onRefresh is a stable useCallback reference.
 */

import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useAppStore } from "../store/appStore";
import { NearbyDevice } from "../types/index";

const getRSSIColor = (rssi: number): string => {
  if (rssi > -60) return "#44FF44";
  if (rssi > -75) return "#FFFF44";
  if (rssi > -90) return "#FF8800";
  return "#FF4444";
};

const getRSSILabel = (rssi: number): string => {
  if (rssi > -60) return "Strong";
  if (rssi > -75) return "Medium";
  if (rssi > -90) return "Weak";
  return "Very Weak";
};

const getSignalBars = (rssi: number): string => {
  if (rssi > -60) return "▂▄▆█";
  if (rssi > -75) return "▂▄▆░";
  if (rssi > -90) return "▂▄░░";
  return "▂░░░";
};

// FIX: Extracted as a pure component so React.memo can skip re-renders
// when the device object reference hasn't changed.
const DeviceRow = React.memo(({ item }: { item: NearbyDevice }) => {
  const timeSince = Math.floor((Date.now() - item.lastSeen) / 1000);
  return (
    <View style={[styles.deviceCard, item.isRescueLink && styles.rescueLinkCard]}>
      <View style={styles.deviceLeft}>
        <Text style={styles.deviceIcon}>{item.isRescueLink ? "🆘" : "📱"}</Text>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName} numberOfLines={1}>
            {item.name || item.id.substring(0, 17)}
          </Text>
          <Text style={styles.deviceId} numberOfLines={1}>
            {item.id.substring(0, 20)}
          </Text>
          {item.isRescueLink && (
            <Text style={styles.rescueLinkBadge}>✅ RescueLink Mesh</Text>
          )}
          <Text style={styles.lastSeen}>{timeSince}s ago</Text>
        </View>
      </View>
      <View style={styles.deviceRight}>
        <Text style={[styles.rssiValue, { color: getRSSIColor(item.rssi) }]}>
          {item.rssi}
        </Text>
        <Text style={styles.rssiUnit}>dBm</Text>
        <Text style={[styles.signalBars, { color: getRSSIColor(item.rssi) }]}>
          {getSignalBars(item.rssi)}
        </Text>
        <Text style={[styles.rssiLabel, { color: getRSSIColor(item.rssi) }]}>
          {getRSSILabel(item.rssi)}
        </Text>
      </View>
    </View>
  );
});

const NearbyDevicesScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { nearbyDevices, isScanning, bleStatus } = useAppStore();

  // FIX: useMemo instead of useEffect+setState — avoids double render
  const sortedDevices = useMemo(() => {
    const now = Date.now();
    return Object.values(nearbyDevices)
      .filter((d) => now - d.lastSeen < 30000)
      .sort((a, b) => b.rssi - a.rssi);
  }, [nearbyDevices]);

  const rescueLinkCount = useMemo(
    () => sortedDevices.filter((d) => d.isRescueLink).length,
    [sortedDevices]
  );
  const otherCount = sortedDevices.length - rescueLinkCount;

  // FIX: stable renderItem reference — FlatList won't re-render all rows
  const renderItem = useCallback(
    ({ item }: { item: NearbyDevice }) => <DeviceRow item={item} />,
    []
  );

  const keyExtractor = useCallback((item: NearbyDevice) => item.id, []);

  const onRefresh = useCallback(() => {}, []);

  const listHeader = useMemo(
    () => (
      <Text style={styles.listHeader}>
        Devices seen in last 30s • sorted by signal strength
      </Text>
    ),
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NEARBY DEVICES</Text>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{sortedDevices.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: "#FF4444" }]}>
            {rescueLinkCount}
          </Text>
          <Text style={styles.statLabel}>RescueLink</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{otherCount}</Text>
          <Text style={styles.statLabel}>Other BLE</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isScanning ? "#44FF44" : "#FF4444" }]}>
            {isScanning ? "🔍 ON" : "⚫ OFF"}
          </Text>
          <Text style={styles.statLabel}>Scanning</Text>
        </View>
      </View>

      <View style={styles.bleStatusBar}>
        <Text style={styles.bleStatusText}>
          BLE: {bleStatus} {bleStatus === "PoweredOn" ? "✅" : "❌"}
        </Text>
      </View>

      {sortedDevices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyText}>
            {isScanning ? "Scanning... move around to find devices" : "Scanning is OFF"}
          </Text>
          <Text style={styles.emptySubtext}>
            {isScanning
              ? "Any nearby Bluetooth device will appear here"
              : "Enable scanning from Dashboard"}
          </Text>
          {!isScanning && (
            <Text style={styles.bleHint}>BLE Status: {bleStatus}</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={sortedDevices}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#FF8800" />
          }
          ListHeaderComponent={listHeader}
          // FIX: tell FlatList items have fixed height so it skips layout measurement
          getItemLayout={(_data, index) => ({
            length: 84,
            offset: 84 * index,
            index,
          })}
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  header: {
    backgroundColor: "#2a2a2a",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomColor: "#444",
    borderBottomWidth: 1,
  },
  headerTitle: { color: "#FF8800", fontSize: 16, fontWeight: "700", letterSpacing: 1 },
  headerClose: { color: "#FFF", fontSize: 20 },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#2a2a2a",
    paddingVertical: 12,
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { color: "#FF8800", fontSize: 18, fontWeight: "700" },
  statLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  bleStatusBar: {
    backgroundColor: "#1a2a1a",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
  bleStatusText: { color: "#AAA", fontSize: 11, fontFamily: "monospace" },
  list: { padding: 12 },
  listHeader: { color: "#666", fontSize: 10, marginBottom: 8, fontStyle: "italic" },
  deviceCard: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderColor: "#444",
    borderWidth: 1,
    height: 76, // fixed height to support getItemLayout
  },
  rescueLinkCard: { borderColor: "#FF4444", borderWidth: 2, backgroundColor: "#2a1a1a" },
  deviceLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  deviceIcon: { fontSize: 24, marginRight: 10 },
  deviceInfo: { flex: 1 },
  deviceName: { color: "#FFF", fontSize: 13, fontWeight: "600", marginBottom: 2 },
  deviceId: { color: "#666", fontSize: 10, fontFamily: "monospace", marginBottom: 2 },
  rescueLinkBadge: { color: "#FF8800", fontSize: 10, fontWeight: "700", marginBottom: 2 },
  lastSeen: { color: "#555", fontSize: 10 },
  deviceRight: { alignItems: "center", minWidth: 60 },
  rssiValue: { fontSize: 20, fontWeight: "700" },
  rssiUnit: { color: "#666", fontSize: 10 },
  signalBars: { fontSize: 14, marginTop: 2, fontFamily: "monospace" },
  rssiLabel: { fontSize: 9, marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: "#AAA", fontSize: 16, textAlign: "center", marginBottom: 8 },
  emptySubtext: { color: "#666", fontSize: 12, textAlign: "center", marginBottom: 12 },
  bleHint: { color: "#FF4444", fontSize: 12, fontFamily: "monospace", marginTop: 8 },
});

export default NearbyDevicesScreen;