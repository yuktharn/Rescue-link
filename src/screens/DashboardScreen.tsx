/**
 * src/screens/DashboardScreen.tsx — FIXED
 *
 * CHANGES:
 * 1. Added BLE Unauthorized banner with "Open Settings" deep-link
 * 2. Added "🗺 View Victim Map" action button
 * 3. Added hamburger menu (slide-in drawer) for all screens not in tab bar:
 *    VictimMode, ResponderMode, Settings, VictimMap, RawPackets, Network, NearbyDevices
 * 4. Added Linking import for Settings deep-link
 */

import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Linking,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import {useAppStore} from '../store/appStore';
import {AppMode, DeviceStatus} from '../types/index';

const SCREEN_W = Dimensions.get('window').width;
const DRAWER_W = SCREEN_W * 0.72;

const DashboardScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {
    mode, victimCount, victims, battery, setMode,
    isScanning, isAdvertising, bleStatus, nearbyDevices, deviceId,
  } = useAppStore();

  const [sosCount, setSOSCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_W)).current;

  const nearbyCount = Object.values(nearbyDevices).filter(
    d => Date.now() - d.lastSeen < 30000,
  ).length;
  const rescueLinkNearby = Object.values(nearbyDevices).filter(
    d => d.isRescueLink && Date.now() - d.lastSeen < 30000,
  ).length;

  useEffect(() => {
    setSOSCount(Object.values(victims).filter(v => v.status === DeviceStatus.SOS).length);
  }, [victims]);

  // ── Drawer helpers ────────────────────────────────────────────────────────
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(slideAnim, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start();
  };

  const closeDrawer = (cb?: () => void) => {
    Animated.timing(slideAnim, {
      toValue: -DRAWER_W, duration: 200, useNativeDriver: true,
    }).start(() => {
      setDrawerOpen(false);
      cb?.();
    });
  };

  const drawerNavigate = (screen: string) => {
    closeDrawer(() => navigation.navigate(screen));
  };

  // ── BLE helpers ───────────────────────────────────────────────────────────
  const getBleStatusColor = () => {
    if (bleStatus === 'PoweredOn')  return '#44FF44';
    if (bleStatus === 'PoweredOff') return '#FF4444';
    if (bleStatus === 'Unauthorized') return '#FF4444';
    return '#FF8800';
  };

  const handleStartVictimMode = () => {
    setMode(AppMode.VICTIM_AGGRESSIVE);
    navigation.navigate('VictimMode');
  };
  const handleStartResponderMode = () => {
    setMode(AppMode.RESPONDER);
    navigation.navigate('ResponderMode');
  };
  const handleStopMode = () => setMode(AppMode.IDLE);

  // ── Drawer menu items ─────────────────────────────────────────────────────
  const drawerItems = [
    { icon: '🗺',  label: 'Victim Map',      screen: 'VictimMap' },
    { icon: '📡',  label: 'Nearby Devices',  screen: 'NearbyDevices' },
    { icon: '🕸️',  label: 'Network Graph',   screen: 'Network' },
    { icon: '🔍',  label: 'Raw Packets',     screen: 'RawPackets' },
    { icon: '👤',  label: 'Victim Mode',     screen: 'VictimMode' },
    { icon: '🚨',  label: 'Responder Mode',  screen: 'ResponderMode' },
    { icon: '⚙️',  label: 'Settings',        screen: 'Settings' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />

      {/* ── Header row with hamburger ─────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>🆘 RESCUELINK</Text>
        <View style={styles.topBarRight}>
          <Text style={styles.deviceIdText}>
            {deviceId ? deviceId.substring(0, 12) : '...'}
          </Text>
          <TouchableOpacity style={styles.hamburger} onPress={openDrawer}>
            <View style={styles.hamLine} />
            <View style={styles.hamLine} />
            <View style={styles.hamLine} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>

        {/* ── BLE Unauthorized banner ───────────────────────────────────── */}
        {bleStatus === 'Unauthorized' && (
          <TouchableOpacity
            style={styles.unauthorizedBanner}
            onPress={() => Linking.openSettings()}>
            <Text style={styles.unauthorizedTitle}>
              🔒 Bluetooth Permission Denied
            </Text>
            <Text style={styles.unauthorizedBody}>
              RescueLink cannot scan for devices.{'\n'}
              Tap here → open Settings → grant Bluetooth access.
            </Text>
            <Text style={styles.unauthorizedCta}>Open Settings →</Text>
          </TouchableOpacity>
        )}

        {/* ── Status Banner ─────────────────────────────────────────────── */}
        <View style={[styles.statusBanner, sosCount > 0 ? styles.bannerAlert : styles.bannerNormal]}>
          <Text style={styles.bannerTitle}>
            {sosCount > 0 ? '🆘 SOS ACTIVE' : '✅ Normal Status'}
          </Text>
          <Text style={styles.bannerSubtitle}>
            Battery: {battery}% • Mode: {mode.toUpperCase()}
          </Text>
        </View>

        {/* ── BLE Status ───────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>BLE STATUS</Text>
          <View style={styles.bleStatusRow}>
            <View style={[styles.bleStatusDot, {backgroundColor: getBleStatusColor()}]} />
            <Text style={[styles.bleStatusText, {color: getBleStatusColor()}]}>
              {bleStatus}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Scanning</Text>
              <Text style={[styles.statusValue, isScanning ? styles.statusActive : styles.statusInactive]}>
                {isScanning ? '🟢 ON' : '⚫ OFF'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Advertising</Text>
              <Text style={[styles.statusValue, isAdvertising ? styles.statusActive : styles.statusInactive]}>
                {isAdvertising ? '🟢 ON' : '⚫ OFF'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Nearby</Text>
              <Text style={[styles.statusValue, {color: '#FF8800'}]}>📡 {nearbyCount}</Text>
            </View>
          </View>
        </View>

        {/* ── Nearby Devices quick-tap ──────────────────────────────────── */}
        <TouchableOpacity
          style={styles.nearbyCard}
          onPress={() => navigation.navigate('NearbyDevices')}>
          <View style={styles.nearbyLeft}>
            <Text style={styles.nearbyIcon}>📡</Text>
            <View>
              <Text style={styles.nearbyTitle}>Nearby BLE Devices</Text>
              <Text style={styles.nearbySubtitle}>
                {nearbyCount} total • {rescueLinkNearby} RescueLink
              </Text>
            </View>
          </View>
          <Text style={styles.nearbyArrow}>›</Text>
        </TouchableOpacity>

        {/* ── Victim Count ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>VICTIMS DETECTED</Text>
          <Text style={styles.victimCountText}>{victimCount}</Text>
          <Text style={styles.cardSubtext}>
            {sosCount} SOS Signals • {Object.keys(victims).length} Devices
          </Text>
          {/* Victim Map shortcut */}
          <TouchableOpacity
            style={styles.mapShortcut}
            onPress={() => navigation.navigate('VictimMap')}>
            <Text style={styles.mapShortcutText}>🗺 View Victim Map →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Mode Selection ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MODE SELECTION</Text>
          <TouchableOpacity
            style={[styles.modeButton, mode === AppMode.VICTIM_AGGRESSIVE && styles.modeButtonActive]}
            onPress={handleStartVictimMode}>
            <Text style={styles.modeButtonText}>👤 VICTIM MODE</Text>
            <Text style={styles.modeButtonDesc}>Full scanning & relay (aggressive)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === AppMode.RESPONDER && styles.modeButtonActive]}
            onPress={handleStartResponderMode}>
            <Text style={styles.modeButtonText}>🚨 RESPONDER MODE</Text>
            <Text style={styles.modeButtonDesc}>Collect & process localization data</Text>
          </TouchableOpacity>
          {mode !== AppMode.IDLE && (
            <TouchableOpacity style={styles.stopButton} onPress={handleStopMode}>
              <Text style={styles.stopButtonText}>⏹ STOP / IDLE</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>QUICK ACTIONS</Text>
          {[
            { label: '🗺 View Victim Map',      screen: 'VictimMap' },
            { label: '📡 View Nearby Devices',  screen: 'NearbyDevices' },
            { label: '🕸️ View Network Graph',   screen: 'Network' },
            { label: '🔍 Raw BLE Packets',      screen: 'RawPackets' },
            { label: '⚙️ Settings',             screen: 'Settings' },
          ].map(item => (
            <TouchableOpacity
              key={item.screen}
              style={styles.actionButton}
              onPress={() => navigation.navigate(item.screen)}>
              <Text style={styles.actionButtonText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* ── Hamburger Drawer ─────────────────────────────────────────────── */}
      <Modal
        visible={drawerOpen}
        transparent
        animationType="none"
        onRequestClose={() => closeDrawer()}>

        {/* Dim backdrop — tap to close */}
        <TouchableWithoutFeedback onPress={() => closeDrawer()}>
          <View style={styles.drawerBackdrop} />
        </TouchableWithoutFeedback>

        {/* Sliding panel */}
        <Animated.View style={[styles.drawer, {transform: [{translateX: slideAnim}]}]}>
          <SafeAreaView style={styles.drawerInner}>

            {/* Drawer header */}
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>🆘 RESCUELINK</Text>
              <TouchableOpacity onPress={() => closeDrawer()}>
                <Text style={styles.drawerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Device ID */}
            <View style={styles.drawerDeviceRow}>
              <Text style={styles.drawerDeviceLabel}>Device</Text>
              <Text style={styles.drawerDeviceId}>{deviceId ?? '—'}</Text>
            </View>

            {/* BLE status in drawer */}
            <View style={styles.drawerStatusRow}>
              <View style={[styles.bleStatusDot, {backgroundColor: getBleStatusColor()}]} />
              <Text style={[styles.drawerStatusText, {color: getBleStatusColor()}]}>
                {bleStatus}
              </Text>
            </View>

            <View style={styles.drawerDivider} />

            {/* Nav items */}
            {drawerItems.map(item => (
              <TouchableOpacity
                key={item.screen}
                style={styles.drawerItem}
                onPress={() => drawerNavigate(item.screen)}>
                <Text style={styles.drawerItemIcon}>{item.icon}</Text>
                <Text style={styles.drawerItemLabel}>{item.label}</Text>
                <Text style={styles.drawerItemArrow}>›</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.drawerDivider} />

            {/* Mode indicator */}
            <View style={styles.drawerModeRow}>
              <Text style={styles.drawerModeLabel}>Current mode</Text>
              <Text style={styles.drawerModeValue}>{mode.toUpperCase()}</Text>
            </View>

          </SafeAreaView>
        </Animated.View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:   {flex: 1, backgroundColor: '#1a1a1a'},

  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#2a2a2a', borderBottomColor: '#444', borderBottomWidth: 1,
  },
  appTitle:    {color: '#FF8800', fontSize: 20, fontWeight: '800'},
  topBarRight: {flexDirection: 'row', alignItems: 'center', gap: 12},
  deviceIdText:{color: '#666', fontSize: 10, fontFamily: 'monospace'},
  hamburger:   {padding: 4, gap: 4, justifyContent: 'center'},
  hamLine:     {width: 22, height: 2, backgroundColor: '#FF8800', borderRadius: 1},

  content:     {padding: 16},

  // ── Unauthorized banner ───────────────────────────────────────────────────
  unauthorizedBanner: {
    backgroundColor: '#3a1a1a', borderRadius: 12, padding: 16,
    marginBottom: 12, borderColor: '#FF4444', borderWidth: 2,
  },
  unauthorizedTitle: {color: '#FF4444', fontSize: 14, fontWeight: '700', marginBottom: 6},
  unauthorizedBody:  {color: '#CCC', fontSize: 12, lineHeight: 18, marginBottom: 8},
  unauthorizedCta:   {color: '#FF8800', fontSize: 13, fontWeight: '700'},

  // ── Status banner ─────────────────────────────────────────────────────────
  statusBanner: {borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4},
  bannerAlert:  {backgroundColor: '#3a1a1a', borderLeftColor: '#FF4444'},
  bannerNormal: {backgroundColor: '#1a3a1a', borderLeftColor: '#44FF44'},
  bannerTitle:  {color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4},
  bannerSubtitle:{color: '#CCC', fontSize: 12},

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#2a2a2a', borderRadius: 12, padding: 16,
    marginBottom: 12, borderColor: '#444', borderWidth: 1,
  },
  cardLabel: {color: '#FF8800', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12},
  cardSubtext:{color: '#AAA', fontSize: 12},

  // ── BLE status ────────────────────────────────────────────────────────────
  bleStatusRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
  bleStatusDot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
  bleStatusText:{fontSize: 14, fontWeight: '700'},
  statusRow:    {flexDirection: 'row', justifyContent: 'space-around'},
  statusItem:   {alignItems: 'center'},
  statusLabel:  {color: '#AAA', fontSize: 11, marginBottom: 4},
  statusValue:  {fontSize: 14, fontWeight: '600'},
  statusActive: {color: '#44FF44'},
  statusInactive:{color: '#555'},

  // ── Nearby card ───────────────────────────────────────────────────────────
  nearbyCard: {
    backgroundColor: '#2a2a2a', borderRadius: 12, padding: 16, marginBottom: 12,
    borderColor: '#FF8800', borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  nearbyLeft:   {flexDirection: 'row', alignItems: 'center'},
  nearbyIcon:   {fontSize: 28, marginRight: 12},
  nearbyTitle:  {color: '#FFF', fontSize: 14, fontWeight: '600'},
  nearbySubtitle:{color: '#888', fontSize: 11, marginTop: 2},
  nearbyArrow:  {color: '#FF8800', fontSize: 28, fontWeight: '300'},

  // ── Victim count ──────────────────────────────────────────────────────────
  victimCountText:{color: '#FFF', fontSize: 48, fontWeight: '700', marginBottom: 4},
  mapShortcut:  {
    marginTop: 12, paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#1a1a1a', borderRadius: 8,
    borderColor: '#FF8800', borderWidth: 1, alignSelf: 'flex-start',
  },
  mapShortcutText:{color: '#FF8800', fontSize: 13, fontWeight: '600'},

  // ── Mode buttons ──────────────────────────────────────────────────────────
  modeButton: {
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12,
    marginBottom: 8, borderColor: '#444', borderWidth: 1,
  },
  modeButtonActive:{borderColor: '#FF8800', borderWidth: 2, backgroundColor: '#2a1a0a'},
  modeButtonText: {color: '#FFF', fontWeight: '600', fontSize: 14, marginBottom: 4},
  modeButtonDesc: {color: '#AAA', fontSize: 11},
  stopButton: {
    backgroundColor: '#3a1a1a', borderRadius: 8, padding: 12,
    marginTop: 4, borderColor: '#FF4444', borderWidth: 1, alignItems: 'center',
  },
  stopButtonText:{color: '#FF4444', fontWeight: '600', fontSize: 14},

  // ── Action buttons ────────────────────────────────────────────────────────
  actionButton: {
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12,
    marginBottom: 8, borderColor: '#FF8800', borderWidth: 1,
  },
  actionButtonText:{color: '#FF8800', fontWeight: '600', fontSize: 14},

  // ── Drawer ────────────────────────────────────────────────────────────────
  drawerBackdrop:{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  drawer: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    width: DRAWER_W, backgroundColor: '#1e1e1e',
    shadowColor: '#000', shadowOffset: {width: 4, height: 0},
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 16,
  },
  drawerInner:  {flex: 1},
  drawerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomColor: '#333', borderBottomWidth: 1,
  },
  drawerTitle:  {color: '#FF8800', fontSize: 18, fontWeight: '800'},
  drawerClose:  {color: '#666', fontSize: 22, padding: 4},
  drawerDeviceRow:{paddingHorizontal: 20, paddingTop: 14},
  drawerDeviceLabel:{color: '#555', fontSize: 10, letterSpacing: 1},
  drawerDeviceId:{color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 2},
  drawerStatusRow:{
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4,
  },
  drawerStatusText:{fontSize: 12, fontWeight: '600', marginLeft: 6},
  drawerDivider:{height: 1, backgroundColor: '#2a2a2a', marginVertical: 8},
  drawerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomColor: '#252525', borderBottomWidth: 1,
  },
  drawerItemIcon: {fontSize: 18, width: 30},
  drawerItemLabel:{color: '#DDD', fontSize: 14, flex: 1, fontWeight: '500'},
  drawerItemArrow:{color: '#555', fontSize: 20},
  drawerModeRow:{
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  drawerModeLabel:{color: '#555', fontSize: 11},
  drawerModeValue:{color: '#FF8800', fontSize: 11, fontWeight: '700'},
});

export default DashboardScreen;