import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/bridge_api.dart';

void main() {
  test('test login exchanges handle/passphrase for an in-memory token', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requests = <Map<String, dynamic>>[];
    server.listen((request) async {
      expect(request.method, 'POST');
      expect(request.uri.path, '/internal/lab/login');
      requests.add(Map<String, dynamic>.from(jsonDecode(
          await utf8.decoder.bind(request).join()) as Map));
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({'token':'test.jwt.signature','expiresIn':1800}));
      await request.response.close();
    });
    try {
      final api = await BridgeApi.labLogin(
        'http://127.0.0.1:' + server.port.toString(), 'tester_a', 'synthetic-passphrase');
      expect(requests.single['handle'], 'tester_a');
      expect(requests.single['passphrase'], 'synthetic-passphrase');
      expect(api.token, 'test.jwt.signature');
      api.dispose();
    } finally {
      await server.close(force:true);
    }
  });
  test('test login cannot contact external HTTP endpoints', () async {
    await expectLater(BridgeApi.labLogin(
      'http://example.com:8787','tester_a','test-passphrase'),
      throwsFormatException);
  });
}
