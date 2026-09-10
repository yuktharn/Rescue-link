/**
 * CRITICAL DEBUGGING SCREEN
 * Shows raw BLE packets and parsed data
 * Essential for verifying data flow in hackathon
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
} from "react-native";
import { useAppStore } from "../store/appStore";

const RawPacketsScreen: React.FC = ({ navigation }: any) => {
  const { rawPackets, clearRawPackets } = useAppStore();
  const [selectedPacket, setSelectedPacket] = useState(0);

  if (rawPackets.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>RAW BLE PACKETS</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No packets received yet</Text>
          <Text style={styles.emptySubtext}>
            Start scanning to collect BLE data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const packet = rawPackets[selectedPacket];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          RAW BLE PACKETS ({rawPackets.length})
        </Text>
        <TouchableOpacity
          onPress={() => {
            clearRawPackets();
            navigation.goBack();
          }}
        >
          <Text style={styles.headerClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Packet List Navigation */}
        <View style={styles.navigationCard}>
          <FlatList
            data={rawPackets.slice(0, 10)}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.packetNav,
                  selectedPacket === index && styles.packetNavActive,
                ]}
                onPress={() => setSelectedPacket(index)}
              >
                <Text
                  style={[
                    styles.packetNavText,
                    selectedPacket === index && styles.packetNavTextActive,
                  ]}
                >
                  #{index}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(_, i) => i.toString()}
          />
        </View>

        {packet && (
          <>
            {/* Raw Hex Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔴 RAW HEX PAYLOAD</Text>
              <View style={styles.hexContainer}>
                <Text style={styles.hexText} selectable>
                  {packet.rawHex}
                </Text>
              </View>
              <Text style={styles.hexSize}>
                Size: {(packet.rawHex.length / 2).toFixed(0)} bytes
              </Text>
            </View>

            {/* Parsed Header Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 PACKET HEADER</Text>
              <View style={styles.dataTable}>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Advertiser ID:</Text>
                  <Text style={styles.dataValue}>{packet.parsed.advertiserId}</Text>
                </View>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Sequence:</Text>
                  <Text style={styles.dataValue}>
                    {packet.parsed.sequenceNumber}
                  </Text>
                </View>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Timestamp:</Text>
                  <Text style={styles.dataValue}>
                    {new Date(packet.parsed.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Chunk:</Text>
                  <Text style={styles.dataValue}>
                    {packet.parsed.chunkIndex + 1}/{packet.parsed.totalChunks}
                  </Text>
                </View>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Received:</Text>
                  <Text style={styles.dataValue}>
                    {new Date(packet.receivedAt).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Victims List */}
            {packet.parsed.victims.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  👥 VICTIMS ({packet.parsed.victims.length})
                </Text>
                {packet.parsed.victims.map((victim, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    <Text style={styles.itemTitle}>{victim.deviceId}</Text>
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemDetail}>
                        Status: {victim.status === 0 ? "Normal" : victim.status === 1 ? "SOS" : "Trapped"}
                      </Text>
                      <Text style={styles.itemDetail}>
                        Battery: {victim.battery}%
                      </Text>
                      <Text style={styles.itemDetail}>
                        Updated: {new Date(victim.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* RSSI Readings */}
            {packet.parsed.rssiReadings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  📡 RSSI READINGS ({packet.parsed.rssiReadings.length})
                </Text>
                {packet.parsed.rssiReadings.slice(0, 20).map((reading, idx) => (
                  <View key={idx} style={styles.readingCard}>
                    <View style={styles.readingHeader}>
                      <Text style={styles.readingFrom}>
                        {reading.fromDeviceId} →
                      </Text>
                      <Text style={styles.readingTo}>{reading.toDeviceId}</Text>
                    </View>
                    <View style={styles.readingMeta}>
                      <Text style={styles.readingMetaText}>
                        RSSI: {reading.rssi} dBm
                      </Text>
                      <Text style={styles.readingMetaText}>
                        Hops: {reading.hopCount}
                      </Text>
                      <Text style={styles.readingMetaText}>
                        Age: {Math.round((Date.now() - reading.timestamp) / 1000)}s
                      </Text>
                    </View>
                  </View>
                ))}
                {packet.parsed.rssiReadings.length > 20 && (
                  <Text style={styles.moreText}>
                    ... and {packet.parsed.rssiReadings.length - 20} more
                  </Text>
                )}
              </View>
            )}

            {/* Copy & Share */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>📋 Copy Hex</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>🗑️ Clear All</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  header: {
    backgroundColor: "#2a2a2a",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomColor: "#444",
    borderBottomWidth: 1,
  },
  headerTitle: {
    color: "#FF8800",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerClose: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#888",
    fontSize: 12,
  },
  navigationCard: {
    marginBottom: 16,
  },
  packetNav: {
    backgroundColor: "#2a2a2a",
    borderRadius: 6,
    padding: 8,
    marginRight: 8,
    borderColor: "#444",
    borderWidth: 1,
  },
  packetNavActive: {
    backgroundColor: "#FF8800",
    borderColor: "#FF8800",
  },
  packetNavText: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
  },
  packetNavTextActive: {
    color: "#1a1a1a",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#FF8800",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  hexContainer: {
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    padding: 12,
    borderColor: "#333",
    borderWidth: 1,
  },
  hexText: {
    color: "#00FF00",
    fontSize: 10,
    fontFamily: "monospace",
    lineHeight: 18,
  },
  hexSize: {
    color: "#666",
    fontSize: 10,
    marginTop: 6,
  },
  dataTable: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    overflow: "hidden",
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
  dataLabel: {
    color: "#AAA",
    fontSize: 12,
    flex: 1,
  },
  dataValue: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
  },
  itemCard: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderColor: "#444",
    borderWidth: 1,
  },
  itemTitle: {
    color: "#44FF44",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  itemDetails: {
    backgroundColor: "#1a1a1a",
    borderRadius: 4,
    padding: 8,
  },
  itemDetail: {
    color: "#AAA",
    fontSize: 11,
    lineHeight: 16,
  },
  readingCard: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftColor: "#FF8800",
    borderLeftWidth: 3,
  },
  readingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  readingFrom: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  readingTo: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  readingMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  readingMetaText: {
    color: "#888",
    fontSize: 10,
  },
  moreText: {
    color: "#666",
    fontSize: 11,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 16,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#FF8800",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#1a1a1a",
    fontWeight: "700",
    fontSize: 12,
  },
});

export default RawPacketsScreen;