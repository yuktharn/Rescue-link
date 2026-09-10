/**
 * Settings and Configuration Screen
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { useAppStore } from "../store/appStore";
import { StorageService } from "../services/StorageService";

const SettingsScreen: React.FC = ({ navigation }: any) => {
  const { deviceId, reset } = useAppStore();
  const [useSimulation, setUseSimulation] = useState(false);
  const [verboseLogging, setVerboseLogging] = useState(false);

  const handleReset = () => {
    reset();
    StorageService.clearAll();
    navigation.navigate("Dashboard");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Device Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>DEVICE</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Device ID:</Text>
            <Text style={styles.infoValue}>{deviceId}</Text>
          </View>
        </View>

        {/* BLE Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>BLE SETTINGS</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Use Simulation Mode</Text>
            <Switch
              value={useSimulation}
              onValueChange={setUseSimulation}
              trackColor={{ false: "#333", true: "#FF8800" }}
              thumbColor={useSimulation ? "#FFF" : "#666"}
            />
          </View>
          <Text style={styles.settingDesc}>
            Generate fake victim data for testing
          </Text>
        </View>

        {/* Debug Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>DEBUG</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Verbose Logging</Text>
            <Switch
              value={verboseLogging}
              onValueChange={setVerboseLogging}
              trackColor={{ false: "#333", true: "#FF8800" }}
              thumbColor={verboseLogging ? "#FFF" : "#666"}
            />
          </View>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>📋 View Logs</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ABOUT</Text>
          <Text style={styles.aboutText}>
            RescueLink v1.0.0{"\n"}
            BLE Mesh Disaster Victim Localization{"\n"}
            Hackathon Edition
          </Text>
        </View>

        {/* Danger Zone */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>DANGER ZONE</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleReset}
          >
            <Text style={styles.dangerButtonText}>🗑️ RESET ALL DATA</Text>
          </TouchableOpacity>
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
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  infoLabel: {
    color: "#AAA",
    fontSize: 12,
  },
  infoValue: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  settingLabel: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "500",
  },
  settingDesc: {
    color: "#666",
    fontSize: 11,
    marginLeft: 0,
    marginTop: -6,
  },
  actionButton: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
    borderColor: "#444",
    borderWidth: 1,
  },
  actionButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 12,
  },
  aboutText: {
    color: "#AAA",
    fontSize: 12,
    lineHeight: 18,
  },
  dangerButton: {
    backgroundColor: "#4a1a1a",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderColor: "#FF4444",
    borderWidth: 2,
  },
  dangerButtonText: {
    color: "#FF4444",
    fontWeight: "700",
    fontSize: 12,
  },
});

export default SettingsScreen;