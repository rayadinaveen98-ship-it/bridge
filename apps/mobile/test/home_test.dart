import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/main.dart';

void main() {
  testWidgets('internal app starts disconnected without fabricated chats',
      (tester) async {
    await tester.pumpWidget(const BridgeApp());
    expect(find.text('INTERNAL M1'), findsOneWidget);
    expect(find.text('CONNECT TO LAB'), findsOneWidget);
    expect(find.text('Connect securely'), findsOneWidget);
    expect(find.text('No saved connections yet'), findsNothing);
    expect(find.byType(TextField), findsNWidgets(2));
  });
}
