import 'dart:async';

import 'package:flutter/foundation.dart';
import 'bridge_api.dart';

/// M1 internal test flow: one session, one active conversation, no persisted JWT.
class BridgeController extends ChangeNotifier {
  BridgeApi? api;
  bool busy = false;
  bool searching = false;
  bool syncing = false;
  bool connected = false;
  String? error;
  String? info;
  String? requestId;
  String? conversationId;
  String? peerId;
  String peerName = 'Someone new';
  int cursor = 0;
  final List<Map<String, dynamic>> messages = [];
  final List<Map<String, dynamic>> connections = [];
  final List<Map<String, String>> languages = [];
  final Set<String> chosenLanguages = {};
  String intention = 'just_chat';
  String? topic;
  String? pendingText;
  String? pendingMessageId;
  bool _disposed = false;
  bool _refreshAgain = false;
  int _streamVersion = 0;
  Timer? _queueTimer, _reconnectTimer;
  StreamSubscription<BridgeEvent>? _subscription;
  int _reconnectAttempt = 0;

  void _notify() { if (!_disposed) notifyListeners(); }
  void _failure(Object err) {
    error = err is BridgeException ? err.toString()
        : err is FormatException ? err.message : 'Network unavailable: $err';
    _notify();
  }

  Future<void> connect(String endpoint, String bearer) async {
    busy = true;
    error = null;
    _notify();
    final candidate = BridgeApi(endpoint, bearer);
    try {
      final result = await candidate.bootstrap();
      final available = (result['languages'] as List? ?? []);
      final catalog = available.map((lang) {
        final value = Map<String, dynamic>.from(lang as Map);
        return {
          'code': value['code'].toString(),
          'name': (value['displayName'] ?? value['code']).toString(),
        };
      }).toList()..sort((a, b) => a['name']!.compareTo(b['name']!));
      await disconnect();
      api = candidate;
      languages..clear()..addAll(catalog);
      chosenLanguages.clear(); // Language choice is never preselected.
      connected = true;
      info = 'Authenticated lab session. Choose your languages.';
    } catch (e) {
      candidate.dispose();
      _failure(e);
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<void> disconnect() async {
    await _stopUpdates();
    api?.dispose();
    api = null;
    connected = false;
    busy = false;
    searching = false;
    requestId = null;
    conversationId = null;
    peerId = null;
    messages.clear();
    connections.clear();
    cursor = 0;
    pendingMessageId = null;
    pendingText = null;
    _notify();
  }

  void toggleLanguage(String code) {
    if (chosenLanguages.contains(code)) {
      chosenLanguages.remove(code);
    } else {
      chosenLanguages.add(code);
    }
    error = null;
    _notify();
  }

  void setIntention(String value) { intention = value; _notify(); }
  void setTopic(String? value) { topic = value; _notify(); }

  Future<void> startSearch() async {
    final client = api;
    if (client == null) return;
    if (chosenLanguages.isEmpty) {
      error = 'Select at least one language to find a match.';
      _notify();
      return;
    }
    busy = true;
    error = null;
    info = null;
    _notify();
    try {
      await client.setPreferences(chosenLanguages.toList()..sort(), intention,
          topic: topic);
      final rid = newRequestId();
      final result = await client.search(requestId: rid, topic: topic);
      requestId = rid;
      searching = true;
      if (result['state'] == 'connected' && result['conversationId'] is String) {
        searching = false;
        await openConversation(result['conversationId'] as String);
      } else {
        _queueTimer?.cancel();
        _queueTimer = Timer.periodic(const Duration(seconds: 2),
            (_) => pollSearch());
        info = 'Looking for a compatible person...';
      }
    } catch (e) {
      _failure(e);
    } finally {
      busy = false;
      _notify();
    }
  }

  bool _polling = false;
  Future<void> pollSearch() async {
    final client = api, rid = requestId;
    if (_polling || !searching || client == null || rid == null) return;
    _polling = true;
    try {
      final state = await client.searchStatus(rid);
      final status = state['state']?.toString();
      if (status == 'connected' && state['conversationId'] is String) {
        searching = false;
        _queueTimer?.cancel();
        await openConversation(state['conversationId'] as String);
      } else if (['expired', 'cancelled', 'unmatched'].contains(status)) {
        searching = false;
        _queueTimer?.cancel();
        info = 'No match yet. You can try again.';
        _notify();
      }
    } catch (e) {
      _failure(e);
    } finally {
      _polling = false;
    }
  }

  Future<void> cancelSearch() async {
    final client = api, rid = requestId;
    searching = false;
    _queueTimer?.cancel();
    requestId = null;
    info = 'Search cancelled.';
    _notify();
    if (client != null && rid != null) {
      try { await client.cancelSearch(rid); }
      catch (e) { _failure(e); }
    }
  }

  Future<void> openConversation(String id) async {
    await _stopUpdates();
    conversationId = id;
    peerId = null;
    peerName = 'Someone new';
    messages.clear();
    cursor = 0;
    error = null;
    pendingText = null;
    pendingMessageId = null;
    searching = false;
    _queueTimer?.cancel();
    _notify();
    try {
      final profile = await api!.peer(id);
      if (conversationId != id) return;
      peerId = profile['accountId']?.toString();
      peerName = profile['pseudonym']?.toString() ?? 'Someone new';
      // Subscribe then read history on ready to avoid the replay/stream race.
      _listen(id);
    } catch (e) { _failure(e); }
    _notify();
  }

  void _listen(String id) {
    _subscription?.cancel();
    _reconnectTimer?.cancel();
    final version = ++_streamVersion;
    final client = api;
    if (client == null) return;
    _subscription = client.events(id).listen((event) async {
      if (version != _streamVersion || id != conversationId) return;
      if (event.type == 'ready' || event.type == 'message-available') {
        _reconnectAttempt = 0;
        await refreshMessages();
      }
    }, onError: (Object e) {
      if (version != _streamVersion) return;
      _failure(e);
      if (e is BridgeException && [401, 403, 404].contains(e.status)) return;
      _scheduleReconnect(id, version);
    }, onDone: () {
      if (version == _streamVersion) _scheduleReconnect(id, version);
    }, cancelOnError: true);
  }

  void _scheduleReconnect(String id, int version) {
    if (conversationId != id || version != _streamVersion || api == null) return;
    _reconnectTimer?.cancel();
    final seconds = 1 << _reconnectAttempt.clamp(0, 3);
    _reconnectAttempt = (_reconnectAttempt + 1).clamp(0, 3);
    _reconnectTimer = Timer(Duration(seconds: seconds), () {
      if (conversationId == id && version == _streamVersion) _listen(id);
    });
  }

  Future<void> refreshMessages() async {
    final client = api, cid = conversationId;
    if (client == null || cid == null) return;
    if (syncing) { _refreshAgain = true; return; }
    syncing = true;
    _notify();
    try {
      do {
        _refreshAgain = false;
        // API pages are capped at 50; drain until a short page arrives.
        while (client == api && cid == conversationId) {
          final result = await client.messages(cid, after: cursor);
          final known = messages.map((m) => m['id']).toSet();
          for (final msg in result) {
            final seq = (msg['sequenceNumber'] as num).toInt();
            if (seq > cursor) cursor = seq;
            if (known.add(msg['id'])) messages.add(msg);
          }
          _notify();
          if (result.length < 50) break;
        }
      } while (_refreshAgain && client == api && cid == conversationId);
    } catch (e) { _failure(e); }
    finally { syncing = false; _notify(); }
  }

  Future<bool> send(String text) async {
    final client = api, cid = conversationId;
    if (client == null || cid == null || text.trim().isEmpty) return false;
    if (pendingText != text || pendingMessageId == null) {
      pendingText = text;
      pendingMessageId = newRequestId();
    }
    busy = true;
    error = null;
    _notify();
    try {
      await client.sendMessage(cid, text, clientMessageId: pendingMessageId!);
      pendingMessageId = null;
      pendingText = null;
      await refreshMessages();
      return true;
    } catch (e) { _failure(e); return false; }
    finally { busy = false; _notify(); }
  }

  Future<String?> keepConnection() async {
    final client = api, cid = conversationId;
    if (client == null || cid == null) return null;
    try {
      final result = await client.vote(cid, 'accept');
      info = result['status'] == 'connected'
          ? 'You are mutually connected.' : 'Request saved privately until both agree.';
      _notify();
      return result['status']?.toString();
    } catch (e) { _failure(e); return null; }
  }

  Future<void> endChat() async {
    final client = api, cid = conversationId;
    if (client != null && cid != null) {
      try { await client.closeConversation(cid); }
      catch (e) { _failure(e); return; }
    }
    await leaveChat();
  }

  Future<void> leaveChat() async {
    await _stopUpdates();
    conversationId = null;
    peerId = null;
    messages.clear();
    cursor = 0;
    _notify();
  }

  Future<bool> blockPeer() async {
    final client = api, target = peerId;
    if (client == null || target == null) return false;
    try {
      await client.block(target);
      await leaveChat();
      info = 'Account blocked.';
      _notify();
      return true;
    } catch (e) { _failure(e); return false; }
  }

  Future<bool> reportPeer(String category) async {
    final client = api, target = peerId, cid = conversationId;
    if (client == null || target == null || cid == null) return false;
    try {
      await client.report(target, cid, category);
      info = 'Report submitted to the internal review queue.';
      _notify();
      return true;
    } catch (e) { _failure(e); return false; }
  }

  Future<void> loadConnections() async {
    final client = api;
    if (client == null) return;
    try {
      final result = await client.connections();
      connections..clear()..addAll(result);
      _notify();
    } catch (e) { _failure(e); }
  }

  Future<void> _stopUpdates() async {
    _streamVersion++;
    _queueTimer?.cancel();
    _reconnectTimer?.cancel();
    await _subscription?.cancel();
    _subscription = null;
  }

  Future<void> resume() async {
    if (searching) await pollSearch();
    if (conversationId != null && api != null) {
      _listen(conversationId!);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _queueTimer?.cancel();
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    api?.dispose();
    super.dispose();
  }
}
