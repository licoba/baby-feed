import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const FEEDINGS_KEY = 'feeding-history';
const formatTime = (date: Date) => date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const formatDate = (date: Date) => date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const BIRTH_DATE = new Date(2026, 8, 21);
const intervalParts = (current: string, previous?: string) => { if (!previous) return null; const m = Math.max(0, Math.floor((new Date(previous).getTime() - new Date(current).getTime()) / 60000)); return { h: Math.floor(m / 60), m: m % 60 }; };
const babyDay = (date: Date) => Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - BIRTH_DATE.getTime()) / 86400000) + 1;
const localGet = (key: string) => { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; } };
const localSet = (key: string, value: string) => { try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch {} };
const localRemove = (key: string) => { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch {} };

export default function App() {
  const [now, setNow] = useState(new Date());
  const [feedings, setFeedings] = useState<string[]>([]);
  const family = 'default-family';
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const compact = !landscape;

  const lastDate = feedings.length ? new Date(feedings[0]) : null;
  const elapsedMinutes = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / 60000) : 30;
  const canRecord = !lastDate || elapsedMinutes >= 30;
  const remainingMinutes = Math.max(1, 30 - elapsedMinutes);
  const elapsedHours = lastDate ? Math.floor(elapsedMinutes / 60) : 0;
  const elapsedRemainderMinutes = lastDate ? elapsedMinutes % 60 : 0;
  const readyToMix = !!lastDate && elapsedMinutes >= 90;
  const elapsedText = lastDate ? (elapsedHours > 0 ? `${elapsedHours} 小时 ${elapsedRemainderMinutes} 分钟` : `${elapsedRemainderMinutes} 分钟`) : '暂无记录';

  const syncFromCloud = async (code = family) => {
    if (!code) return;
    try { const r = await fetch(`/api/feedings?family=${encodeURIComponent(code)}`); const d = await r.json(); if (Array.isArray(d.feedings)) { setFeedings(d.feedings); localSet(FEEDINGS_KEY, JSON.stringify(d.feedings)); } } catch {}
  };
  useEffect(() => {
    syncFromCloud();
    const local = localGet(FEEDINGS_KEY);
    if (local) { try { setFeedings(JSON.parse(local)); } catch {} }
    const timer = setInterval(() => setNow(new Date()), 1000);
    let events: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      events = new EventSource(`/api/events?family=${encodeURIComponent(family)}`);
      events.onmessage = (event) => { try { const d = JSON.parse(event.data); if (Array.isArray(d.feedings)) setFeedings(d.feedings); } catch {} };
    }
    return () => { clearInterval(timer); if (events) events.close(); };
  }, []);

  const recordFeeding = async () => {
    try {
      const latestResponse = await fetch(`/api/feedings?family=${encodeURIComponent(family)}`);
      const latestData = await latestResponse.json();
      if (Array.isArray(latestData.feedings)) {
        setFeedings(latestData.feedings);
        const latest = latestData.feedings[0] ? new Date(latestData.feedings[0]) : null;
        if (latest && (Date.now() - latest.getTime()) < 30 * 60 * 1000) return;
      }
    } catch {}
    if (!canRecord) {
      Alert.alert('暂时不能记录', `距离上次吃奶还不到 30 分钟，请再等 ${remainingMinutes} 分钟。`);
      return;
    }
    const timestamp = new Date().toISOString();
    const next = [timestamp, ...feedings];
    setFeedings(next);
    localSet(FEEDINGS_KEY, JSON.stringify(next));
    if (family) fetch('/api/feedings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ family, at: timestamp }) }).then(() => syncFromCloud()).catch(() => {});
  };

  const clearHistory = async () => {
    setFeedings([]);
    localRemove(FEEDINGS_KEY);
  };

  const history = <View style={styles.historyCard}>
    <View style={styles.historyHeader}>
      <Text style={styles.lastLabel}>吃奶历史</Text>
      {feedings.length > 0 && <Pressable onPress={clearHistory}><Text style={styles.clearText}>清空</Text></Pressable>}
    </View>
    {feedings.length === 0 ? <Text style={styles.emptyText}>还没有记录</Text> : <ScrollView showsVerticalScrollIndicator={false} style={styles.historyList} contentContainerStyle={styles.historyContent}>
      {feedings.map((value, index) => { const date = new Date(value); return <View style={[styles.historyRow, index === 0 && styles.featuredHistoryRow]} key={value}><View><Text style={[styles.historyTime, index > 0 && styles.olderHistoryTime]}>{formatTime(date)}</Text><Text style={[styles.historyDate, index > 0 && styles.olderHistoryDate]}>{formatDate(date)} <Text style={styles.sinceText}>{index === 0 ? '最近一次' : (() => { const gap = intervalParts(value, feedings[index - 1]); return `+${gap.h} 小时 ${gap.m} 分钟`; })()}</Text></Text></View><Text style={styles.index}>{index + 1}</Text></View>; })}
    </ScrollView>}
  </View>;

  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark" /><View style={[styles.container, compact && styles.portraitContainer, landscape && styles.landscapeContainer]}>
    <View style={[styles.mainPanel, compact && styles.portraitMain, landscape && styles.landscapeMain]}>
      <Text style={[styles.date, landscape && styles.landscapeDate]}>{formatDate(now)}（第 {babyDay(now)} 天）</Text>
      <Text style={[styles.clock, compact && styles.portraitClock, landscape && styles.landscapeClock]}>{formatTime(now)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="记录宝宝刚吃完奶" onPress={recordFeeding} disabled={!canRecord} style={({ pressed }) => [styles.recordButton, compact && styles.portraitRecordButton, !canRecord && styles.recordButtonDisabled, pressed && canRecord && styles.recordButtonPressed]}><Text style={styles.recordButtonText}>刚吃完奶</Text></Pressable>
      <View style={[styles.elapsedCard, compact && styles.portraitElapsedCard, landscape && styles.landscapeElapsedCard, readyToMix && styles.readyCard]}><Text style={styles.elapsedLabel}>{readyToMix ? '可以冲奶了！' : '距离上次吃奶'}</Text><Text style={[styles.elapsedTime, readyToMix && styles.readyTime]}>{lastDate ? <><Text style={styles.elapsedNumber}>{elapsedHours}</Text><Text> 小时 </Text><Text style={styles.elapsedNumber}>{elapsedRemainderMinutes}</Text><Text> 分钟</Text></> : '暂无记录'}</Text></View>
    </View>
    <View style={[styles.historyPanel, landscape && styles.landscapeHistory]}>{history}</View>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF8F2' }, container: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 }, portraitContainer: { paddingHorizontal: 16, paddingTop: 14 }, portraitMain: { justifyContent: 'flex-start' }, portraitClock: { fontSize: 48, marginTop: 16 }, portraitRecordButton: { marginTop: 24, paddingVertical: 16 }, portraitElapsedCard: { marginTop: 14, padding: 12 }, landscapeContainer: { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 28, paddingTop: 20, paddingBottom: 20 }, mainPanel: { width: '100%', minHeight: 0 }, landscapeMain: { flex: 1, width: 0, minWidth: 0, paddingHorizontal: 20, justifyContent: 'flex-start', paddingTop: 2 }, landscapeDate: { marginTop: 0 }, landscapeClock: { marginTop: 6, fontSize: 52 }, landscapeRecordButton: { marginTop: 16, paddingVertical: 16 }, landscapeElapsedCard: { marginTop: 10, padding: 12 }, mainContent: { alignItems: 'center', paddingBottom: 12, flexGrow: 1 }, historyPanel: { width: '100%', flex: 1, minHeight: 0, marginTop: 14 }, landscapeHistory: { flex: 1, width: 0, minWidth: 0, marginLeft: 20, marginTop: 0, minHeight: 0 }, logo: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#F28B66', borderRadius: 16, height: 32, justifyContent: 'center', marginBottom: 4, width: 32 }, logoText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' }, date: { color: '#9B8176', fontSize: 16, marginTop: 2 }, babyAge: { color: '#B46D52', fontSize: 15, fontWeight: '600', marginTop: 5 }, clock: { color: '#3A2A25', fontSize: 64, fontWeight: '300', letterSpacing: 2, marginTop: 24 }, clockLabel: { color: '#9B8176', fontSize: 15, marginTop: 4 }, recordButton: { alignItems: 'center', backgroundColor: '#F28B66', borderRadius: 28, elevation: 3, marginTop: 40, paddingVertical: 20, shadowColor: '#D46D4A', shadowOpacity: 0.2, shadowRadius: 8, width: '100%' }, recordButtonPressed: { backgroundColor: '#DF7552', transform: [{ scale: 0.98 }] }, recordButtonDisabled: { backgroundColor: '#D8BEB3', opacity: 0.9 }, recordButtonText: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' }, recordButtonHint: { color: '#FFE9DE', fontSize: 14, marginTop: 6 }, elapsedCard: { alignItems: 'center', backgroundColor: '#FFF0E8', borderRadius: 22, marginTop: 20, padding: 16, width: '100%' }, readyCard: { backgroundColor: '#E8F7E8' }, elapsedLabel: { color: '#B46D52', fontSize: 16, fontWeight: '600' }, readyTime: { color: '#37834A' }, elapsedTime: { color: '#7D5B4C', fontSize: 16, fontWeight: '400', letterSpacing: 0.2, marginTop: 6 }, elapsedNumber: { fontSize: 36, fontWeight: '800' }, sinceText: { color: '#C59B89', fontSize: 11 }, readyHint: { color: '#4E925B', fontSize: 13, marginTop: 4 }, elapsedExplain: { color: '#4E925B', fontSize: 13, marginTop: 4 }, landscapeLastHidden: { display: 'none' }, recentTop: { alignSelf: 'stretch', marginBottom: 8 }, recentTopPortrait: { marginBottom: 2 }, recentTopLabel: { color: '#B46D52', fontSize: 15, fontWeight: '600' }, recentTopTime: { color: '#3A2A25', fontSize: 28, fontWeight: '700', marginTop: 2 }, sideRecentCard: { alignItems: 'center', backgroundColor: '#FFF0E8', borderRadius: 22, marginBottom: 14, padding: 20, width: '100%' }, sideRecentLabel: { color: '#B46D52', fontSize: 16, fontWeight: '600' }, sideRecentTime: { color: '#3A2A25', fontSize: 42, fontWeight: '700', marginTop: 6 }, featuredHistoryRow: { paddingVertical: 12 }, olderHistoryTime: { fontSize: 17 }, olderHistoryDate: { fontSize: 11 }, lastCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 22, marginTop: 20, padding: 18, width: '100%' }, lastLabel: { color: '#9B8176', fontSize: 15 }, lastTime: { color: '#3A2A25', fontSize: 32, fontWeight: '600', marginTop: 8 }, lastDate: { color: '#B29B91', fontSize: 14, marginTop: 4 }, syncBox: { flexDirection: 'row', marginTop: 14, width: '100%' }, familyInput: { backgroundColor: '#FFFFFF', borderRadius: 12, flex: 1, paddingHorizontal: 14, paddingVertical: 10 }, syncButton: { backgroundColor: '#6C9D74', borderRadius: 12, justifyContent: 'center', marginLeft: 8, paddingHorizontal: 14 }, syncButtonText: { color: '#FFFFFF', fontWeight: '600' }, historyCard: { backgroundColor: '#FFFFFF', borderRadius: 22, flex: 1, minHeight: 0, padding: 20, width: '100%' }, historyHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, clearText: { color: '#E77752', fontSize: 14 }, emptyText: { color: '#B29B91', fontSize: 15, paddingVertical: 28, textAlign: 'center', whiteSpace: 'nowrap' }, historyList: { flex: 1, minHeight: 0, marginTop: 12 }, historyContent: { paddingBottom: 4 }, historyRow: { alignItems: 'center', borderBottomColor: '#F5E9E2', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }, historyTime: { color: '#3A2A25', fontSize: 22, fontWeight: '600' }, historyDate: { color: '#B29B91', fontSize: 13, marginTop: 3 }, index: { color: '#E8C9BA', fontSize: 16, fontWeight: '600' },
});
