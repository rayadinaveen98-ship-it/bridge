import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/bridge_api.dart';

void main() {
  test('lab client rejects remote, insecure token-bearing endpoints', () {
    expect(validateLabEndpoint('http://127.0.0.1:8787').host, '127.0.0.1');
    expect(validateLabEndpoint('http://10.0.2.2:8787').host, '10.0.2.2');
    for (final bad in [
      'https://example.com',
      'http://example.com:8787',
      'https://127.0.0.1:8787',
      'http://user:password@127.0.0.1:8787',
      'http://127.0.0.1:8787/chat',
      'http://127.0.0.1:8787?token=a',
    ]) {
      expect(() => validateLabEndpoint(bad), throwsFormatException, reason: bad);
    }
  });
  test('request IDs are proper UUID v4 shape and distinct', () {
    final first = newRequestId();
    final second = newRequestId();
    expect(first, matches(RegExp(
      r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')));
    expect(second, isNot(first));
  });
  test('SSE frames parse, comments ignored, and no bodies inferred', () {
    final parser = SseParser();
    expect(parser.acceptLine(': heartbeat'), isNull);
    expect(parser.acceptLine('event: message-available'), isNull);
    expect(parser.acceptLine('data: {"messageId":"m1","sequenceNumber":2}'), isNull);
    final result = parser.acceptLine('');
    expect(result?.type, 'message-available');
    expect(result?.payload['messageId'], 'm1');
    expect(result?.payload.containsKey('body'), isFalse);
    expect(parser.acceptLine('event: ready'), isNull);
    expect(parser.acceptLine('data: {"replay":"GET"}'), isNull);
    expect(parser.acceptLine('')?.type, 'ready');
  });
}
