import 'dart:async';

import 'package:flutter/foundation.dart';
import 'bridge_api.dart';
import 'message_reconciliation.dart';

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
  // Leaving the view never silently ends an open random conversation.
  String? resumableConversationId;
  bool conversationIsSaved = false;
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
  // Invalidate in-flight peer lookups when leaving or switching rooms.
  int _conversationEpoch = 0;
  Timer? _queueTimer, _reconnectTimer;
  StreamSubscription<BridgeEvent>? _subscription;
  int _reconnectAttempt = 0;

  void _notify() { if (!_disposed) notifyListeners(); }
  void _failure(Object err) {
    error = err is BridgeException ? err.toString()
        : err is FormatException ? err.message : 'Network unavailable: $err';
    _notify();
  }

  Future<void> connect(String endpoint, String handle, String passphrase) async {
    if (busy) return;
    busy = true;
    error = null;
    _notify();
    BridgeApi? candidate;
    try {
      candidate = await BridgeApi.labLogin(endpoint, handle, passphrase);
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
      busy = true;
      api = candidate;
      languages..clear()..addAll(catalog);
      chosenLanguages.clear(); // Language choice is never preselected.
      connected = true;
      final activeId = result['activeConversationId'];
      final pendingRequest = result['activeSearchRequestId'];
      if (activeId is String && activeId.isNotEmpty) {
        info = 'Restoring your existing conversation.';
        await openConversation(activeId);
      } else if (pendingRequest is String && pendingRequest.isNotEmpty) {
        requestId = pendingRequest;
        searching = true;
        info = 'Restoring your existing search.';
        _startQueuePolling();
        await pollSearch();
      } else {
        info = 'Test account connected. Choose your languages.';
      }
    } catch (e) {
      candidate?.dispose();
      _failure(e);
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<void> disconnect() async {
    _conversationEpoch++;
    await _stopUpdates();
    api?.dispose();
    api = null;
    connected = false;
    busy = false;
    searching = false;
    requestId = null;
    conversationId = null;
    resumableConversationId = null;
    conversationIsSaved = false;
    peerId = null;
    peerName = 'Someone new';
    messages.clear();
    connections.clear();
    cursor = 0;
    pendingMessageId = null;
    pendingText = null;
    info = null;
    error = null;
    _notify();
  }

  void clearError() { error = null; _notify(); }

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
    if (client == null || busy || searching || conversationId != null) return;
    if (resumableConversationId != null) {
      error = 'You have a conversation in progress. Resume or end it first.';
      _notify();
      return;
    }
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
      if (client != api) return;
      if (result['state'] == 'connected' && result['conversationId'] is String) {
        searching = false;
        await openConversation(result['conversationId'] as String);
      } else {
        _startQueuePolling();
        info = 'Looking for a compatible person...';
      }
    } catch (e) {
      if (client != api) return;
      if (e is BridgeException && e.status == 409 &&
          (e.code == 'active_match' || e.code == 'already_searching')) {
        try {
          if (!await _recoverServerState(client)) {
            searching = false;
            requestId = null;
            _failure(e);
          }
        } catch (recoveryError) {
          searching = false;
          requestId = null;
          _failure(recoveryError);
        }
      } else {
        searching = false;
        requestId = null;
        _failure(e);
      }
    } finally {
      busy = false;
      _notify();
    }
  }

  bool _polling = false;
  void _startQueuePolling() {
    _queueTimer?.cancel();
    _queueTimer = Timer.periodic(const Duration(seconds: 2), (_) => pollSearch());
  }

  /// Restores only state supplied by an authenticated, server-owned bootstrap.
  Future<bool> _recoverServerState(BridgeApi client) async {
    final state = await client.bootstrap();
    if (client != api) return false;
    final active = state['activeConversationId'];
    if (active is String && active.isNotEmpty) {
      await openConversation(active);
      if (conversationId == active) {
        info = 'Resumed your ongoing conversation.';
        _notify();
        return true;
      }
      return false;
    }
    final waiting = state['activeSearchRequestId'];
    if (waiting is String && waiting.isNotEmpty) {
      requestId = waiting;
      searching = true;
      _startQueuePolling();
      info = 'Continuing your existing search.';
      _notify();
      await pollSearch();
      return true;
    }
    return false;
  }

  Future<void> resumeOngoingChat() async {
    final id = resumableConversationId;
    if (id != null && !busy) await openConversation(id);
  }

  Future<void> pollSearch() async {
    final client = api, rid = requestId;
    if (_polling || !searching || client == null || rid == null) return;
    _polling = true;
    try {
      final state = await client.searchStatus(rid);
      if (client != api || rid != requestId || !searching) return;
      final status = state['state']?.toString();
      if (status == 'connected' && state['conversationId'] is String) {
        searching = false;
        _queueTimer?.cancel();
        await openConversation(state['conversationId'] as String);
      } else if (['expired', 'cancelled', 'unmatched'].contains(status)) {
        searching = false;
        requestId = null;
        _queueTimer?.cancel();
        info = 'No match yet. You can try again.';
        _notify();
      }
    } catch (e) {
      if (client == api && rid == requestId && searching) _failure(e);
    } finally {
      _polling = false;
    }
  }

  Future<void> cancelSearch() async {
    final client = api, rid = requestId;
    if (client == null || rid == null || busy) return;
    busy = true;
    searching = false;
    _queueTimer?.cancel();
    requestId = null;
    info = 'Cancelling search...';
    _notify();
    try {
      await client.cancelSearch(rid);
      if (client != api) return;
      // A match may have committed just before cancellation. Never discard
      // that active room or create a second session.
      final status = await client.bootstrap();
      if (client != api) return;
      final active = status['activeConversationId'];
      if (active is String && active.isNotEmpty) {
        resumableConversationId = active;
        info = 'A conversation began before cancellation. You can resume it.';
      } else {
        info = 'Search cancelled.';
      }
    } catch (e) {
      if (client == api) _failure(e);
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<void> openConversation(String id) async {
    final client = api;
    if (client == null) return;
    final epoch = ++_conversationEpoch;
    await _stopUpdates();
    if (epoch != _conversationEpoch || client != api) return;
    conversationId = id;
    resumableConversationId = null;
    conversationIsSaved = false;
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
      final profile = await client.peer(id);
      if (epoch != _conversationEpoch ||
          conversationId != id || client != api) return;
      peerId = profile['accountId']?.toString();
      peerName = profile['pseudonym']?.toString() ?? 'Someone new';
      conversationIsSaved = profile['conversationKind'] == 'connection';
      // Subscribe first, then reconcile. A ready event can request another
      // refresh; concurrent refreshes are coalesced by refreshMessages.
      _listen(id);
      await refreshMessages();
    } catch (e) {
      if (client == api && epoch == _conversationEpoch &&
          conversationId == id) {
        conversationId = null;
        resumableConversationId = null;
        conversationIsSaved = false;
        peerId = null;
        messages.clear();
        cursor = 0;
        _failure(e);
      }
    }
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
    final seconds = 1 << _reconnectAttempt.clamp(0, 3).toInt();
    _reconnectAttempt = (_reconnectAttempt + 1).clamp(0, 3).toInt();
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
          // A conversation may change while the request is in flight.
          if (client != api || cid != conversationId) break;
          final previousCursor = cursor;
          final page = reconcileBridgeMessagePage(
            existing: messages, incoming: result, after: cursor);
          messages.addAll(page.fresh);
          cursor = page.cursor;
          _notify();
          if (result.length < 50) break;
          if (cursor == previousCursor) {
            throw const FormatException(
              'Replay page made no progress; retry refresh.');
          }
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
      if (result['status'] == 'connected') {
        conversationIsSaved = true;
        resumableConversationId = null;
      }
      info = result['status'] == 'connected'
          ? 'You are mutually connected.' : 'Request saved privately until both agree.';
      _notify();
      return result['status']?.toString();
    } catch (e) { _failure(e); return null; }
  }

  Future<void> endChat() async {
    final client = api, cid = conversationId ?? resumableConversationId;
    if (client == null || cid == null) return;
    if (conversationIsSaved) {
      error = 'This is a saved connection, not a random chat.';
      _notify();
      return;
    }
    try { await client.closeConversation(cid); }
    catch (e) {
      if (e is BridgeException &&
          e.status == 409 && e.code == 'use_connection_controls') {
        conversationIsSaved = true;
        resumableConversationId = null;
        info = 'Both users saved this connection. Open it from Connections.';
        _notify();
        return;
      }
      _failure(e);
      return;
    }
    await leaveChat(preserveActive: false);
    info = 'Random conversation ended. You may search again.';
    _notify();
  }

  /// "Back" only hides the chat; ending it must be explicit.
  Future<void> leaveChat({bool preserveActive = true}) async {
    final ongoing = conversationId ?? resumableConversationId;
    final shouldResume = preserveActive && !conversationIsSaved;
    _conversationEpoch++;
    await _stopUpdates();
    resumableConversationId = shouldResume ? ongoing : null;
    conversationId = null;
    conversationIsSaved = false;
    peerId = null;
    peerName = 'Someone new';
    messages.clear();
    cursor = 0;
    pendingText = null;
    pendingMessageId = null;
    if (resumableConversationId != null) {
      info = 'Your chat is still active. Resume or end it before searching again.';
    }
    _notify();
  }

  Future<bool> blockPeer() async {
    final client = api, target = peerId;
    if (client == null || target == null) return false;
    try {
      await client.block(target);
      await leaveChat(preserveActive: false);
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
