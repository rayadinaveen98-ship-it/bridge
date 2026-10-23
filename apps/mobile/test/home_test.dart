import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/main.dart';

void main() {
  testWidgets('internal app starts disconnected without fabricated chats',
      (tester) async {
    await tester.pumpWidget(const BridgeApp());
    expect(find.text('INTERNAL M1'), findsOneWidget);
    expect(find.text('INTERNAL TEST SIGN IN'), findsOneWidget);
    expect(find.text('Sign in to test Bridge'), findsOneWidget);
    expect(find.text('No saved connections yet'), findsNothing);
    expect(find.byType(TextField), findsNWidgets(3));
  });
}
