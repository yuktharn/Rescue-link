/**
 * Victim Mode Screen — FIXED
 *
 * FIX: Exit button called setMode("idle") with a raw string.
 * Zustand's setMode expects AppMode enum value; passing a plain string
 * caused a type mismatch that silently corrupted mode state and made
 * subsequent mode-change logic in App.tsx no-op.
 * Now uses AppMode.IDLE.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useAppStore } from "../store/appStore";
import { AppMode, DeviceStatus } from "../types/index";

const VictimModeScreen: React.FC = ({ navigation }: any) => {
  const {
    deviceId,
    victimCount,
    victims,
    isScanning,
    isAdvertising,
    setMode,
  } = useAppStore();
  const [sosStatus, setSosStatus] = useState(false);

  useEffect(() => {
    console.log("[VictimMode] Active - scanning & advertising enabled");
  }, []);

  const handleToggleSOS = () => {
    setSosStatus(!sosStatus);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a0a0a" />
      <ScrollView style={styles.content}>
        {/* SOS Banner */}
        <View style={[styles.sosCard, sosStatus && styles.sosCardActive]}>
          <Text style={styles.sosTitle}>
            {sosStatus ? "🆘 SOS ACTIVE" : "⏸️ SOS Inactive"}
          </Text>
          <TouchableOpacity
            style={[styles.sosButton, sosStatus && styles.sosButtonActive]}
            onPress={handleToggleSOS}
          >
            <Text style={styles.sosButtonText}>
              {sosStatus ? "CANCEL SOS" : "SEND SOS"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Device Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>DEVICE INFO</Text>
          <Text style={styles.deviceId}>{deviceId}</Text>
          <Text style={styles.deviceStatus}>
            Status: {sosStatus ? "SOS" : "Normal"}
          </Text>
        </View>

        {/* Nearby Victims */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>NEARBY VICTIMS ({victimCount})</Text>
          {Object.values(victims).length === 0 ? (
            <Text style={styles.emptyText}>Scanning for nearby devices...</Text>
          ) : (
            Object.values(victims).slice(0, 5).map((victim) => (
              <View key={victim.deviceId} style={styles.victimRow}>
                <Text style={styles.victimId}>{victim.deviceId}</Text>
                <Text style={styles.victimStatus}>
                  {victim.status === DeviceStatus.SOS ? "🆘" : "✅"}{" "}
                  {victim.battery}%
                </Text>
              </View>
            ))
          )}
        </View>

        {/* BLE Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>BLE STATUS</Text>
          <View style={styles.statusIndicator}>
            <Text style={styles.statusDot}>{isScanning ? "🟢" : "⚫"}</Text>
            <Text style={styles.statusText}>
              Scanning: {isScanning ? "ACTIVE" : "Idle"}
            </Text>
          </View>
          <View style={styles.statusIndicator}>
            <Text style={styles.statusDot}>{isAdvertising ? "🟢" : "⚫"}</Text>
            <Text style={styles.statusText}>
              Broadcasting: {isAdvertising ? "ACTIVE" : "Idle"}
            </Text>
          </View>
        </View>

        {/* Exit — FIX: was setMode("idle"), now AppMode.IDLE */}
        <TouchableOpacity
          style={styles.exitButton}
          onPress={() => {
            setMode(AppMode.IDLE);
            navigation.goBack();
          }}
        >
          <Text style={styles.exitButtonText}>← EXIT VICTIM MODE</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a0a0a" },
  content: { padding: 16 },
  sosCard: {
    backgroundColor: "#2a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderColor: "#663333",
    borderWidth: 2,
  },
  sosCardActive: { backgroundColor: "#4a1a1a", borderColor: "#FF4444" },
  sosTitle: { color: "#FFF", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  sosButton: {
    backgroundColor: "#333",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  sosButtonActive: { backgroundColor: "#FF4444" },
  sosButtonText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderColor: "#444",
    borderWidth: 1,
  },
  cardTitle: {
    color: "#FF8800",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
  },
  deviceId: { color: "#FFF", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  deviceStatus: { color: "#AAA", fontSize: 12 },
  emptyText: { color: "#666", fontSize: 12, fontStyle: "italic" },
  victimRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
  victimId: { color: "#FFF", fontSize: 12, fontWeight: "500" },
  victimStatus: { color: "#888", fontSize: 12 },
  statusIndicator: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  statusDot: { fontSize: 12, marginRight: 8 },
  statusText: { color: "#AAA", fontSize: 12 },
  exitButton: {
    backgroundColor: "#333",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 16,
  },
  exitButtonText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
});

export default VictimModeScreen;