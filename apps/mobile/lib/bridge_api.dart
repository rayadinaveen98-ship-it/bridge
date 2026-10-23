import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

/// Internal Bridge lab client. No secrets/tokens are persisted to disk.
class BridgeException implements Exception {
  const BridgeException(this.status, this.code);
  final int status;
  final String code;
  @override
  String toString() => 'Bridge error $status: $code';
}

class BridgeEvent {
  const BridgeEvent(this.type, this.payload);
  final String type;
  final Map<String, dynamic> payload;
}

class SseParser {
  String? _type;
  final List<String> _data = [];
  BridgeEvent? acceptLine(String line) {
    if (line.isEmpty) {
      if (_data.isEmpty) {
        _type = null;
        return null;
      }
      final type = _type ?? 'message';
      final data = _data.join('\n');
      _type = null;
      _data.clear();
      final parsed = jsonDecode(data);
      if (parsed is! Map<String, dynamic>) {
        throw const FormatException('Invalid SSE payload');
      }
      return BridgeEvent(type, parsed);
    }
    if (line.startsWith(':')) return null;
    if (line.startsWith('event:')) {
      _type = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      _data.add(line.substring(5).trimLeft());
    }
    return null;
  }
}

Uri validateLabEndpoint(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null ||
      uri.scheme != 'http' ||
      !{'127.0.0.1', 'localhost', '10.0.2.2', '::1'}.contains(uri.host) ||
      uri.port <= 0 ||
      uri.port > 65535 ||
      uri.userInfo.isNotEmpty ||
      uri.path.isNotEmpty && uri.path != '/' ||
      uri.query.isNotEmpty ||
      uri.fragment.isNotEmpty) {
    throw const FormatException(
      'Only loopback or Android emulator host HTTP endpoints are allowed.',
    );
  }
  return uri;
}

String newRequestId() {
  final rng = Random.secure();
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return hex.substring(0, 8) + '-' + hex.substring(8, 12) + '-' +
      hex.substring(12, 16) + '-' + hex.substring(16, 20) + '-' +
      hex.substring(20);
}

class BridgeApi {
  BridgeApi(String endpoint, String bearer)
      : origin = validateLabEndpoint(endpoint),
        token = bearer.trim().replaceFirst(RegExp(r'^Bearer\s+', caseSensitive: false), '') {
    if (token.isEmpty || token.length > 8192) {
      throw const FormatException('A temporary laboratory JWT is required.');
    }
  }

  final Uri origin;
  final String token;
  final HttpClient _http = HttpClient()..connectionTimeout = const Duration(seconds: 8);
  bool _closed = false;

  Uri url(String path) {
    if (!path.startsWith('/v1/')) throw ArgumentError('Invalid API path');
    return origin.resolve(path);
  }

  Future<dynamic> _request(String method, String path,
      {Map<String, dynamic>? body, String? idempotencyKey}) async {
    if (_closed) throw const BridgeException(503, 'client_closed');
    final request = await _http.openUrl(method, url(path))
        .timeout(const Duration(seconds: 12));
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (idempotencyKey != null) request.headers.set('Idempotency-Key', idempotencyKey);
    if (body != null) {
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
    }
    final response = await request.close().timeout(const Duration(seconds: 12));
    final text = await utf8.decoder.bind(response).join()
        .timeout(const Duration(seconds: 12));
    if (response.statusCode >= 400) {
      String code = 'request_failed';
      try {
        final data = jsonDecode(text);
        if (data is Map && data['error'] is String) code = data['error'] as String;
      } catch (_) {}
      throw BridgeException(response.statusCode, code);
    }
    if (response.statusCode == 204 || text.trim().isEmpty) return null;
    return jsonDecode(text);
  }

  Future<Map<String, dynamic>> bootstrap() async =>
      Map<String, dynamic>.from(await _request('GET', '/v1/bootstrap') as Map);

  Future<void> setPreferences(List<String> languages, String intent,
      {String? topic}) async {
    await _request('PUT', '/v1/me/preferences', body: {
      'languageCodes': languages, 'intention': intent,
      'interests': <String>[], 'topic': topic,
    });
  }

  Future<Map<String, dynamic>> search({String? topic, required String requestId}) async =>
      Map<String, dynamic>.from(await _request('POST', '/v1/matches/search',
          idempotencyKey: requestId, body: {'topic': topic}) as Map);

  Future<Map<String, dynamic>> searchStatus(String id) async =>
      Map<String, dynamic>.from(await _request('GET', '/v1/matches/search/$id') as Map);

  Future<void> cancelSearch(String id) async =>
      _request('DELETE', '/v1/matches/search/$id');

  Future<Map<String, dynamic>> peer(String conversationId) async =>
      Map<String, dynamic>.from(
          await _request('GET', '/v1/conversations/$conversationId/peer') as Map);

  Future<List<Map<String, dynamic>>> messages(String conversationId,
      {int after = 0}) async {
    final result = await _request('GET',
        '/v1/conversations/$conversationId/messages?afterSequence=$after') as List;
    return result.map((value) => Map<String, dynamic>.from(value as Map)).toList();
  }

  Future<Map<String, dynamic>> sendMessage(String conversationId, String text,
      {required String clientMessageId}) async =>
      Map<String, dynamic>.from(await _request(
          'POST', '/v1/conversations/$conversationId/messages',
          body: {'clientMessageId': clientMessageId, 'body': text},
          idempotencyKey: clientMessageId) as Map);

  Future<Map<String, dynamic>> vote(String conversationId, String decision) async =>
      Map<String, dynamic>.from(await _request(
          'PUT', '/v1/conversations/$conversationId/connection-vote',
          body: {'decision': decision}) as Map);

  Future<void> closeConversation(String conversationId) async =>
      _request('POST', '/v1/conversations/$conversationId/close', body: {});

  Future<void> block(String accountId) async =>
      _request('PUT', '/v1/blocks/$accountId');

  Future<Map<String, dynamic>> report(String accountId, String conversationId,
          String category) async =>
      Map<String, dynamic>.from(await _request('POST', '/v1/reports', body: {
        'reportedAccountId': accountId,
        'conversationId': conversationId,
        'category': category,
      }) as Map);

  Future<List<Map<String, dynamic>>> connections() async {
    final data = await _request('GET', '/v1/connections') as List;
    return data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  /// SSE is a hint channel, not the source of truth. Open the subscription,
  /// wait for 'ready', then perform REST reconciliation by sequence cursor.
  Stream<BridgeEvent> events(String conversationId) async* {
    if (_closed) throw const BridgeException(503, 'client_closed');
    final streamClient = HttpClient()
      ..connectionTimeout = const Duration(seconds: 8);
    try {
      final req = await streamClient.getUrl(
          url('/v1/conversations/$conversationId/events'));
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      req.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
      final response = await req.close().timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) {
        await response.drain<void>();
        throw BridgeException(response.statusCode, 'event_stream_denied');
      }
      final parser = SseParser();
      await for (final line in response.transform(utf8.decoder)
          .transform(const LineSplitter())) {
        final event = parser.acceptLine(line);
        if (event != null) yield event;
      }
    } finally {
      streamClient.close(force: true);
    }
  }

  void dispose() {
    _closed = true;
    _http.close(force: true);
  }
}
