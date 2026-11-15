import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/bridge_api.dart';
import 'package:bridge_mobile/bridge_controller.dart';

class R0FakeApi extends BridgeApi {
  R0FakeApi() : super('http://127.0.0.1:8787', 'synthetic-test-token');

  String kind = 'random';
  int preferenceWrites = 0;
  int freshSearches = 0;
  int closedRooms = 0;
  int queueCancels = 0;
  int peerReads = 0;
  int messageReads = 0;
  String? currentActiveRoom;
  String? currentSearch;
  bool reportAlreadySearching = false;
  Completer<Map<String, dynamic>>? pendingStatus;
  Completer<Map<String, dynamic>>? pendingPeer;

  @override
  Future<Map<String, dynamic>> bootstrap() async => {
    'languages': [
      {'code': 'en', 'displayName': 'English'}
    ],
    'activeConversationId': currentActiveRoom,
    'activeSearchRequestId': currentSearch,
  };

  @override
  Future<Map<String, dynamic>> peer(String conversationId) async {
    peerReads++;
    if (pendingPeer != null) return pendingPeer!.future;
    return {
      'accountId': 'peer-1',
      'pseudonym': 'Other tester',
      'conversationKind': kind,
    };
  }

  @override
  Stream<BridgeEvent> events(String conversationId) =>
      const Stream<BridgeEvent>.empty();

  @override
  Future<List<Map<String, dynamic>>> messages(String conversationId,
      {int after = 0}) async {
    messageReads++;
    return [];
  }

  @override
  Future<void> setPreferences(List<String> languages, String intent,
      {String? topic}) async {
    preferenceWrites++;
    if (reportAlreadySearching) {
      throw const BridgeException(409, 'already_searching');
    }
  }

  @override
  Future<Map<String, dynamic>> search({
    String? topic, required String requestId,
  }) async {
    freshSearches++;
    return {'requestId': requestId, 'state': 'waiting'};
  }

  @override
  Future<Map<String, dynamic>> searchStatus(String id) async {
    if (pendingStatus != null) return pendingStatus!.future;
    return {'state': 'waiting', 'requestId': id};
  }

  @override
  Future<void> cancelSearch(String id) async {
    queueCancels++;
  }

  @override
  Future<void> closeConversation(String conversationId) async {
    closedRooms++;
    currentActiveRoom = null;
  }
}

void main() {
  test('Back to Discover leaves random chat resumable, not ended', () async {
    final api = R0FakeApi();
    final controller = BridgeController()
      ..api = api
      ..connected = true;
    addTearDown(controller.dispose);

    await controller.openConversation('room-1');
    expect(controller.conversationId, 'room-1');
    await controller.leaveChat();
    expect(controller.conversationId, isNull);
    expect(controller.resumableConversationId, 'room-1');
    expect(api.closedRooms, 0);

    controller.chosenLanguages.add('en');
    await controller.startSearch();
    expect(controller.error, contains('Resume or end'));
    expect(api.preferenceWrites, 0);
    expect(api.freshSearches, 0);

    await controller.resumeOngoingChat();
    expect(controller.conversationId, 'room-1');
    expect(controller.resumableConversationId, isNull);
    expect(api.closedRooms, 0);
    await controller.endChat();
    expect(api.closedRooms, 1);
    expect(controller.conversationId, isNull);
    expect(controller.resumableConversationId, isNull);
  });

  test('End a hidden random chat deliberately, then allow searching', () async {
    final api = R0FakeApi();
    final controller = BridgeController()
      ..api = api
      ..connected = true;
    addTearDown(controller.dispose);
    await controller.openConversation('room-2');
    await controller.leaveChat();
    await controller.endChat();
    expect(api.closedRooms, 1);
    expect(controller.resumableConversationId, isNull);
    controller.chosenLanguages.add('en');
    await controller.startSearch();
    expect(controller.searching, true);
    expect(api.freshSearches, 1);
  });

  test('Saved connections never acquire a random-chat resume slot', () async {
    final api = R0FakeApi()..kind = 'connection';
    final controller = BridgeController()
      ..api = api
      ..connected = true;
    addTearDown(controller.dispose);
    await controller.openConversation('saved-room');
    expect(controller.conversationIsSaved, true);
    await controller.leaveChat();
    expect(controller.resumableConversationId, isNull);
    expect(api.closedRooms, 0);
  });

  test('409 already_searching restores server-owned queued request', () async {
    final api = R0FakeApi()
      ..reportAlreadySearching = true
      ..currentSearch = 'existing-search';
    final controller = BridgeController()
      ..api = api
      ..connected = true;
    addTearDown(controller.dispose);
    controller.chosenLanguages.add('en');
    await controller.startSearch();
    expect(controller.searching, true);
    expect(controller.requestId, 'existing-search');
    expect(api.freshSearches, 0);
    expect(controller.info, contains('Continuing'));
  });

  test('Cancel ignores old in-flight polling responses', () async {
    final api = R0FakeApi()..pendingStatus = Completer();
    final controller = BridgeController()
      ..api = api
      ..connected = true
      ..searching = true
      ..requestId = 'search-before-cancel';
    addTearDown(controller.dispose);
    final pending = controller.pollSearch();
    await Future<void>.delayed(Duration.zero);
    await controller.cancelSearch();
    api.pendingStatus!.complete({
      'state': 'connected',
      'conversationId': 'late-room',
    });
    await pending;
    expect(api.queueCancels, 1);
    expect(controller.conversationId, isNull);
    expect(controller.searching, false);
    expect(controller.requestId, isNull);
  });

  test('Late peer response cannot reopen a chat after Back', () async {
    final api = R0FakeApi()..pendingPeer = Completer();
    final controller = BridgeController()
      ..api = api
      ..connected = true;
    addTearDown(controller.dispose);
    final opening = controller.openConversation('slow-room');
    await Future<void>.delayed(Duration.zero);
    expect(controller.conversationId, 'slow-room');
    await controller.leaveChat();
    expect(controller.resumableConversationId, 'slow-room');
    api.pendingPeer!.complete({
      'accountId': 'peer-1',
      'pseudonym': 'Delayed',
      'conversationKind': 'random',
    });
    await opening;
    expect(controller.conversationId, isNull);
    expect(controller.peerId, isNull);
    expect(controller.resumableConversationId, 'slow-room');
    expect(api.closedRooms, 0);
  });

  test('Cancel surfaces match committed before server cancellation', () async {
    final api = R0FakeApi()..currentActiveRoom = 'just-matched-room';
    final controller = BridgeController()
      ..api = api
      ..connected = true
      ..searching = true
      ..requestId = 'search-race';
    addTearDown(controller.dispose);
    await controller.cancelSearch();
    expect(controller.resumableConversationId, 'just-matched-room');
    expect(controller.searching, false);
    expect(controller.info, contains('resume'));
    expect(api.closedRooms, 0);
  });
}
