/**
 * Network Graph Screen
 * Visualizes connections between victims
 */

import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import { useAppStore } from "../store/appStore";

const NetworkGraphScreen: React.FC = ({ navigation }: any) => {
  const { victims, rssiReadings } = useAppStore();

  const connectionCount = rssiReadings.length;
  const deviceCount = Object.keys(victims).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NETWORK GRAPH</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Network Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{deviceCount}</Text>
            <Text style={styles.statLabel}>Devices</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{connectionCount}</Text>
            <Text style={styles.statLabel}>Connections</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {connectionCount > 0 ? (connectionCount / deviceCount).toFixed(1) : 0}
            </Text>
            <Text style={styles.statLabel}>Avg Links/Device</Text>
          </View>
        </View>

        {/* Graph Visualization (simplified text-based) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TOPOLOGY</Text>
          <View style={styles.graphContainer}>
            {deviceCount === 0 ? (
              <Text style={styles.graphEmpty}>No devices connected</Text>
            ) : (
              <>
                {Object.keys(victims).slice(0, 10).map((victimId) => (
                  <View key={victimId} style={styles.nodeContainer}>
                    <Text style={styles.nodeId}>● {victimId}</Text>
                    <View style={styles.edgesContainer}>
                      {rssiReadings
                        .filter((r) => r.fromDeviceId === victimId)
                        .slice(0, 3)
                        .map((reading, idx) => (
                          <Text key={idx} style={styles.edge}>
                            └─→ {reading.toDeviceId} ({reading.rssi} dBm)
                          </Text>
                        ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>

        {/* Network Analysis */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ANALYSIS</Text>
          <View style={styles.analysisItem}>
            <Text style={styles.analysisLabel}>Network Density:</Text>
            <Text style={styles.analysisValue}>
              {deviceCount > 1
                ? ((connectionCount / (deviceCount * (deviceCount - 1))) * 100).toFixed(1)
                : 0}
              %
            </Text>
          </View>
          <View style={styles.analysisItem}>
            <Text style={styles.analysisLabel}>Signal Quality:</Text>
            <Text style={styles.analysisValue}>
              {rssiReadings.length > 0
                ? (rssiReadings.reduce((sum, r) => sum + r.rssi, 0) / rssiReadings.length).toFixed(0)
                : "N/A"}
              dBm avg
            </Text>
          </View>
        </View>
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
  },
  headerClose: {
    color: "#FFF",
    fontSize: 20,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
    borderColor: "#FF8800",
    borderWidth: 1,
  },
  statValue: {
    color: "#FF8800",
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    color: "#AAA",
    fontSize: 10,
    marginTop: 4,
  },
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
  graphContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
  },
  graphEmpty: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 16,
  },
  nodeContainer: {
    marginBottom: 12,
  },
  nodeId: {
    color: "#44FF44",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  edgesContainer: {
    marginLeft: 12,
  },
  edge: {
    color: "#888",
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 16,
  },
  analysisItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
  analysisLabel: {
    color: "#AAA",
    fontSize: 12,
  },
  analysisValue: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
});

export default NetworkGraphScreen;