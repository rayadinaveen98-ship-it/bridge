import 'package:flutter_test/flutter_test.dart';
import 'package:bridge_mobile/message_reconciliation.dart';

Map<String, dynamic> message(int sequence, [String? id]) => {
  'id': id ?? 'm$sequence',
  'sequenceNumber': sequence,
  'body': 'synthetic',
};

void main() {
  test('contiguous replay accepts ordered messages', () {
    final result = reconcileBridgeMessagePage(
      existing: [],
      incoming: [message(1), message(2), message(3)],
      after: 0,
    );
    expect(result.cursor, 3);
    expect(result.fresh.map((m) => m['id']), ['m1', 'm2', 'm3']);
  });

  test('safe duplicate redelivery does not duplicate messages', () {
    final result = reconcileBridgeMessagePage(
      existing: [message(1), message(2)],
      incoming: [message(2), message(3)],
      after: 2,
    );
    expect(result.cursor, 3);
    expect(result.fresh.map((m) => m['id']), ['m3']);
  });

  test('gap rejects whole page; existing state remains unchanged', () {
    final existing = [message(1)];
    expect(() => reconcileBridgeMessagePage(
      existing: existing,
      incoming: [message(2), message(4)],
      after: 1,
    ), throwsFormatException);
    expect(existing.length, 1);
    expect(existing.single['sequenceNumber'], 1);
  });

  test('out-of-order page never skips a sequence', () {
    expect(() => reconcileBridgeMessagePage(
      existing: [], incoming: [message(2), message(1)], after: 0,
    ), throwsFormatException);
  });

  test('conflicting duplicate and reused ID fail closed', () {
    expect(() => reconcileBridgeMessagePage(
      existing: [message(1)],
      incoming: [message(1, 'different')],
      after: 1,
    ), throwsFormatException);
    expect(() => reconcileBridgeMessagePage(
      existing: [message(1)],
      incoming: [message(2, 'm1')],
      after: 1,
    ), throwsFormatException);
  });

  test('malformed sequence cannot advance cursor', () {
    expect(() => reconcileBridgeMessagePage(
      existing: [], incoming: [{'id': 'bad', 'sequenceNumber': '1'}],
      after: 0,
    ), throwsFormatException);
  });

  test('empty page preserves cursor', () {
    final result = reconcileBridgeMessagePage(
      existing: [message(1)], incoming: [], after: 1,
    );
    expect(result.cursor, 1);
    expect(result.fresh, isEmpty);
  });
}
