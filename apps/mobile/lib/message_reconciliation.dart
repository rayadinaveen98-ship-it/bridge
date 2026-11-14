/// Validates a server message page before it can move the local replay cursor.
/// No existing message state is mutated when a gap or conflicting replay appears.
class BridgeMessagePage {
  const BridgeMessagePage({required this.cursor, required this.fresh});

  final int cursor;
  final List<Map<String, dynamic>> fresh;
}

BridgeMessagePage reconcileBridgeMessagePage({
  required List<Map<String, dynamic>> existing,
  required List<Map<String, dynamic>> incoming,
  required int after,
}) {
  if (after < 0) {
    throw const FormatException('Invalid local message cursor.');
  }
  final knownBySequence = <int, String>{};
  final knownIds = <String>{};
  for (final message in existing) {
    final sequence = message['sequenceNumber'];
    final id = message['id'];
    if (sequence is! int || id is! String || id.isEmpty) {
      throw const FormatException('Invalid cached message.');
    }
    knownBySequence[sequence] = id;
    knownIds.add(id);
  }

  var next = after;
  final fresh = <Map<String, dynamic>>[];
  for (final message in incoming) {
    final sequence = message['sequenceNumber'];
    final id = message['id'];
    if (sequence is! int || sequence <= 0 || id is! String || id.isEmpty) {
      throw const FormatException('Invalid message in replay page.');
    }
    if (sequence <= next) {
      // Identical redelivery is safe; conflicting or unknown history is not.
      if (knownBySequence[sequence] == id) continue;
      throw const FormatException('Conflicting message replay; cursor preserved.');
    }
    if (sequence != next + 1) {
      throw const FormatException(
        'Message sequence gap; retry refresh before advancing.',
      );
    }
    if (!knownIds.add(id)) {
      throw const FormatException('Duplicate message ID at new sequence.');
    }
    knownBySequence[sequence] = id;
    fresh.add(message);
    next = sequence;
  }
  return BridgeMessagePage(cursor: next, fresh: fresh);
}
