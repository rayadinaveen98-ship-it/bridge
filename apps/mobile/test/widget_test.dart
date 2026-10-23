import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/main.dart';

void main() {
  testWidgets('Bridge internal welcome renders without a fake login', (tester) async {
    await tester.pumpWidget(const BridgeApp());
    expect(find.text('bridge'), findsOneWidget);
    expect(find.byIcon(Icons.lock_open), findsOneWidget);
    expect(find.text('Connect securely'), findsOneWidget);
  });
}
