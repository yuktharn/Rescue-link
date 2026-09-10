/**
 * Responder Mode Screen — FIXED
 *
 * FIXES:
 * 1. Exit button called setMode("idle") with a raw string → AppMode.IDLE
 * 2. summaryCard used `backgroundColor: "linear-gradient(...)"` which is invalid
 *    in React Native StyleSheet and causes a yellow-box warning + render stall.
 *    Replaced with a solid dark background color.
 */

import React, { useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import { useAppStore } from "../store/appStore";
import { AppMode } from "../types/index";

const ResponderModeScreen: React.FC = ({ navigation }: any) => {
  const { victimCount, locations, setMode } = useAppStore();

  useEffect(() => {
    console.log("[ResponderMode] Active - collecting and processing data");
  }, []);

  const sortedLocations = Object.values(locations).sort(
    (a, b) => b.confidence - a.confidence
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>RESPONDER MODE</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Summary Card — FIX: removed invalid CSS gradient from backgroundColor */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{victimCount}</Text>
          <Text style={styles.summaryLabel}>VICTIMS LOCATED</Text>
        </View>

        {/* Victims with Estimated Positions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>VICTIM LOCATIONS</Text>
          {sortedLocations.length === 0 ? (
            <Text style={styles.emptyText}>No location data yet</Text>
          ) : (
            sortedLocations.map((location) => (
              <View key={location.deviceId} style={styles.locationCard}>
                <View style={styles.locationHeader}>
                  <Text style={styles.locationId}>{location.deviceId}</Text>
                  <Text style={styles.confidence}>
                    {(location.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.locationData}>
                  <Text style={styles.locationCoord}>
                    Position: ({location.x.toFixed(1)}, {location.y.toFixed(1)}) m
                  </Text>
                  <Text style={styles.locationCoord}>
                    Distance: {location.distance.toFixed(1)} m
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Debug Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>DEBUG</Text>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => navigation.navigate("RawPackets")}
          >
            <Text style={styles.debugButtonText}>📊 View Raw Packets</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Exit — FIX: was setMode("idle"), now AppMode.IDLE */}
      <TouchableOpacity
        style={styles.exitButton}
        onPress={() => {
          setMode(AppMode.IDLE);
          navigation.goBack();
        }}
      >
        <Text style={styles.exitButtonText}>← EXIT RESPONDER MODE</Text>
      </TouchableOpacity>
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
  },
  headerTitle: { color: "#FF8800", fontSize: 16, fontWeight: "700" },
  headerClose: { color: "#FFF", fontSize: 20 },
  content: { flex: 1, padding: 16 },
  // FIX: was `backgroundColor: "linear-gradient(135deg, #4a1a1a, #1a4a1a)"` — invalid in RN
  summaryCard: {
    backgroundColor: "#2a1a0a",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderColor: "#FF8800",
    borderWidth: 2,
  },
  summaryValue: { color: "#FF8800", fontSize: 48, fontWeight: "700" },
  summaryLabel: { color: "#FFF", fontSize: 12, letterSpacing: 1, marginTop: 4 },
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
  emptyText: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 16,
  },
  locationCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderColor: "#FF8800",
    borderWidth: 1,
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  locationId: { color: "#44FF44", fontSize: 13, fontWeight: "700" },
  confidence: { color: "#FF8800", fontSize: 12, fontWeight: "700" },
  locationData: { backgroundColor: "#0a0a0a", borderRadius: 4, padding: 8 },
  locationCoord: {
    color: "#AAA",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "monospace",
  },
  debugButton: {
    backgroundColor: "#444",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  debugButtonText: { color: "#FFF", fontWeight: "600", fontSize: 12 },
  exitButton: {
    backgroundColor: "#333",
    margin: 16,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  exitButtonText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
});

export default ResponderModeScreen;