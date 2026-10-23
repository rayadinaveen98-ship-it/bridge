import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'bridge_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BridgeApp());
}

class BridgeApp extends StatelessWidget {
  const BridgeApp({super.key});
  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFFA08BFF),
      brightness: Brightness.dark,
      surface: const Color(0xFF141728),
    );
    return MaterialApp(
      title: 'Bridge • Internal',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: scheme,
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF10121F),
        fontFamily: 'Roboto',
        cardTheme: CardThemeData(
          color: const Color(0xFF20243A),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF24283E),
          contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      home: const BridgeHome(),
    );
  }
}

class BridgeHome extends StatefulWidget {
  const BridgeHome({super.key});
  @override
  State<BridgeHome> createState() => _BridgeHomeState();
}

class _BridgeHomeState extends State<BridgeHome>
    with WidgetsBindingObserver {
  final BridgeController bridge = BridgeController();
  final endpoint = TextEditingController(text: 'http://127.0.0.1:8787');
  final jwt = TextEditingController();
  final composer = TextEditingController();
  final scroll = ScrollController();
  int tab = 0;
  bool tokenVisible = false;
  int lastMessages = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) bridge.resume();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    bridge.dispose();
    endpoint.dispose();
    jwt.dispose();
    composer.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    await bridge.connect(endpoint.text, jwt.text);
    if (bridge.connected) {
      jwt.clear();
      if (mounted) setState(() { tab = 0; });
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: bridge,
    builder: (context, _) {
      if (bridge.messages.length != lastMessages) {
        lastMessages = bridge.messages.length;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (scroll.hasClients) {
            scroll.animateTo(scroll.position.maxScrollExtent,
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut);
          }
        });
      }
      return Scaffold(
        body: Stack(children: [
          Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft, end: Alignment.bottomRight,
              colors: [const Color(0xFF18152C), const Color(0xFF10121F),
                const Color(0xFF0F1923)],
            ),
          ))),
          SafeArea(child: Center(child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(children: [
              if (bridge.conversationId == null) _header(),
              if (bridge.error != null)
                _banner(bridge.error!, const Color(0xFFB25162), Icons.error_outline,
                    onDismiss: () { bridge.clearError(); }),
              if (bridge.info != null && bridge.conversationId == null)
                _banner(bridge.info!, const Color(0xFF396A66), Icons.info_outline),
              Expanded(child: bridge.conversationId != null ? _chat() :
                  !bridge.connected ? _setup() : _tabContent()),
            ]),
          ))),
        ]),
        bottomNavigationBar: bridge.connected && bridge.conversationId == null
          ? NavigationBar(
              backgroundColor: const Color(0xFF171B2C),
              selectedIndex: tab,
              onDestinationSelected: (value) {
                setState(() { tab = value; });
                if (value == 1) bridge.loadConnections();
              },
              destinations: const [
                NavigationDestination(icon: Icon(Icons.explore_outlined),
                    selectedIcon: Icon(Icons.explore), label: 'Discover'),
                NavigationDestination(icon: Icon(Icons.forum_outlined),
                    selectedIcon: Icon(Icons.forum), label: 'Connections'),
                NavigationDestination(icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person), label: 'Me'),
              ],
            ) : null,
      );
    },
  );

  Widget _header() => Padding(
    padding: const EdgeInsets.fromLTRB(22, 18, 22, 12),
    child: Row(children: [
      Container(width: 38, height: 38,
        decoration: BoxDecoration(
          color: const Color(0xFF8671D4).withValues(alpha: .2),
          borderRadius: BorderRadius.circular(12)),
        child: const Icon(Icons.auto_awesome, color: Color(0xFFB6A4FF)),
      ),
      const SizedBox(width: 12),
      const Text('bridge', style: TextStyle(fontWeight: FontWeight.w800,
          fontSize: 25, letterSpacing: -.8)),
      const Spacer(),
      Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: const Color(0xFF2D3444),
          borderRadius: BorderRadius.circular(99)),
        child: const Text('INTERNAL M1', style: TextStyle(fontSize: 10,
          letterSpacing: 1.0, fontWeight: FontWeight.bold)),
      ),
    ]),
  );

  Widget _banner(String msg, Color color, IconData icon, {VoidCallback? onDismiss}) =>
      Container(
        margin: const EdgeInsets.fromLTRB(18, 4, 18, 8),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .22),
          borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          Icon(icon, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(msg, style: const TextStyle(fontSize: 12))),
          if (onDismiss != null)
            IconButton(onPressed: onDismiss, icon: const Icon(Icons.close, size: 17)),
        ]),
      );

  Widget _setup() => ListView(padding: const EdgeInsets.all(24), children: [
    const SizedBox(height: 32),
    const Text('Real conversations.\nPrivate by design.',
      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 35, height: 1.16,
        letterSpacing: -1.1)),
    const SizedBox(height: 14),
    const Text('This build only connects to a developer-operated test backend. '
      'There is no public registration or live age verification yet.',
      style: TextStyle(color: Color(0xFFB6B5CD), height: 1.5)),
    const SizedBox(height: 36),
    _panel(children: [
      const Text('CONNECT TO LAB', style: TextStyle(
        fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 1.2)),
      const SizedBox(height: 16),
      TextField(controller: endpoint,
        keyboardType: TextInputType.url,
        decoration: const InputDecoration(labelText: 'Loopback API URL',
          prefixIcon: Icon(Icons.link))),
      const SizedBox(height: 14),
      TextField(controller: jwt, obscureText: !tokenVisible,
        enableSuggestions: false, autocorrect: false,
        maxLines: 1,
        decoration: InputDecoration(labelText: 'Temporary test JWT',
          prefixIcon: const Icon(Icons.key_outlined),
          suffixIcon: IconButton(icon: Icon(tokenVisible
            ? Icons.visibility_off : Icons.visibility),
            onPressed: () => setState(() { tokenVisible = !tokenVisible; }))),
      ),
      const SizedBox(height: 18),
      FilledButton.icon(onPressed: bridge.busy ? null : _connect,
        icon: const Icon(Icons.lock_open), label: Text(
          bridge.busy ? 'Connecting...' : 'Connect securely')),
    ]),
    const SizedBox(height: 20),
    const Text('For physical Android devices, run adb reverse tcp:8787 tcp:8787 '
      'while the internal API listens on your computer. Never paste real account tokens.',
      style: TextStyle(fontSize: 12, color: Color(0xFF9494AE), height: 1.5)),
  ]);

  Widget _tabContent() {
    switch (tab) {
      case 1: return _connections();
      case 2: return _profile();
      default: return _discover();
    }
  }

  Widget _discover() => ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
    children: [
      const SizedBox(height: 20),
      const Text('Who will you meet today?',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold,
          letterSpacing: -.5)),
      const SizedBox(height: 8),
      const Text('A spontaneous conversation, with room to become more.',
        style: TextStyle(color: Color(0xFFB6B5CD))),
      const SizedBox(height: 26),
      _panel(children: [
        const Row(children: [
          Icon(Icons.translate, color: Color(0xFFB4A3FF)),
          SizedBox(width: 10),
          Text('Languages', style: TextStyle(fontSize: 17,
            fontWeight: FontWeight.w600))]),
        const SizedBox(height: 8),
        const Text('Select any language you speak. None is prioritized.',
          style: TextStyle(fontSize: 12, color: Color(0xFFB6B5CD))),
        const SizedBox(height: 14),
        if (bridge.languages.isEmpty)
          const Text('No moderated languages available in this lab.',
            style: TextStyle(fontSize: 12)),
        Wrap(spacing: 8, runSpacing: 8,
          children: bridge.languages.map((lang) {
            final code = lang['code']!;
            final selected = bridge.chosenLanguages.contains(code);
            return FilterChip(
              label: Text(lang['name']!),
              selected: selected,
              onSelected: (_) => bridge.toggleLanguage(code),
              showCheckmark: true);
          }).toList()),
      ]),
      const SizedBox(height: 15),
      _panel(children: [
        const Text('I’M HERE FOR', style: TextStyle(fontWeight: FontWeight.w700,
          fontSize: 11, letterSpacing: 1)),
        const SizedBox(height: 10),
        SegmentedButton<String>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: 'just_chat', label: Text('Chat')),
            ButtonSegment(value: 'make_friends', label: Text('Friends')),
            ButtonSegment(value: 'thoughtful_talk', label: Text('Deep talk')),
          ],
          selected: {bridge.intention},
          onSelectionChanged: (items) => bridge.setIntention(items.first)),
        const SizedBox(height: 16),
        const Text('OPTIONAL TOPIC', style: TextStyle(fontWeight: FontWeight.w700,
          fontSize: 11, letterSpacing: 1)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8,
          children: [null, 'Cinema', 'Music', 'Gaming', 'Books', 'Life', 'Tech']
          .map((topic) => ChoiceChip(
            label: Text(topic ?? 'Any topic'),
            selected: bridge.topic == topic,
            onSelected: (_) => bridge.setTopic(topic))).toList()),
      ]),
      const SizedBox(height: 18),
      _panel(children: [
        if (!bridge.searching) ...[
          const Text('Meet someone new',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('Matching only with compatible, eligible lab accounts.',
            style: TextStyle(color: Color(0xFFBBB9D1), fontSize: 12)),
          const SizedBox(height: 18),
          SizedBox(width: double.infinity, child: FilledButton.icon(
            onPressed: bridge.busy ? null : bridge.startSearch,
            icon: const Icon(Icons.auto_awesome),
            label: Text(bridge.busy ? 'Starting...' : 'Find a conversation'))),
        ] else ...[
          const Center(child: CircularProgressIndicator()),
          const SizedBox(height: 16),
          const Text('Looking for a match...',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: bridge.cancelSearch,
            child: const Text('Cancel search')),
        ],
      ]),
    ],
  );

  Widget _connections() => RefreshIndicator(
    onRefresh: bridge.loadConnections,
    child: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 32), children: [
      Row(children: [
        const Expanded(child: Text('Connections', style:
          TextStyle(fontSize: 28, fontWeight: FontWeight.bold))),
        IconButton(tooltip: 'Refresh connections',
          onPressed: bridge.loadConnections, icon: const Icon(Icons.refresh)),
      ]),
      const SizedBox(height: 8),
      const Text('Only mutually accepted connections appear here.',
        style: TextStyle(color: Color(0xFFAAA9C4))),
      const SizedBox(height: 24),
      if (bridge.connections.isEmpty)
        _panel(children: [
          const Icon(Icons.people_outline, size: 38,
            color: Color(0xFFB6A4FF)),
          const SizedBox(height: 12),
          const Text('No saved connections yet',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text('When you both decide to stay connected, '
            'your conversation will appear here.',
            style: TextStyle(color: Color(0xFFB6B5CD))),
        ]),
      ...bridge.connections.map((item) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Card(child: ListTile(
          leading: const CircleAvatar(child: Icon(Icons.person)),
          title: Text(item['pseudonym']?.toString() ?? 'Connection'),
          subtitle: const Text('Mutual connection'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            final id = item['conversationId'];
            if (id is String) bridge.openConversation(id);
          },
        )),
      )),
    ]),
  );

  Widget _profile() => ListView(padding: const EdgeInsets.all(24), children: [
    const SizedBox(height: 16),
    const Text('Your space',
      style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
    const SizedBox(height: 18),
    _panel(children: [
      const Icon(Icons.shield_outlined, size: 38, color: Color(0xFF8EDCC7)),
      const SizedBox(height: 14),
      const Text('Test account connected', style: TextStyle(
        fontSize: 19, fontWeight: FontWeight.bold)),
      const SizedBox(height: 6),
      const Text('Your temporary credential stays in memory only and '
        'is cleared when the app closes.',
        style: TextStyle(color: Color(0xFFB6B5CD))),
      const SizedBox(height: 18),
      SizedBox(width: double.infinity, child: OutlinedButton.icon(
        icon: const Icon(Icons.logout),
        onPressed: () async {
          await bridge.disconnect();
          if (mounted) setState(() { tab = 0; });
        },
        label: const Text('Disconnect lab session'))),
    ]),
    const SizedBox(height: 16),
    _panel(children: [
      const Text('Privacy & safety', style: TextStyle(
        fontSize: 18, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      const Text('Blocking and reports are available in conversations. '
        'The service is not approved for public or real-user matchmaking.',
        style: TextStyle(color: Color(0xFFB6B5CD), height: 1.45)),
    ]),
  ]);

  Widget _chat() {
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
        child: Row(children: [
          IconButton(tooltip: 'Leave conversation', onPressed: bridge.leaveChat,
            icon: const Icon(Icons.arrow_back)),
          CircleAvatar(backgroundColor: const Color(0xFF504876),
            child: Text(bridge.peerName.isNotEmpty
              ? bridge.peerName[0].toUpperCase() : '?')),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(bridge.peerName, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              const Text('Pseudonymous conversation',
                style: TextStyle(color: Color(0xFFAAA9C4), fontSize: 11)),
            ])),
          IconButton(tooltip: 'Refresh messages', icon: const Icon(Icons.sync),
            onPressed: bridge.refreshMessages),
          PopupMenuButton<String>(
            tooltip: 'Safety actions',
            onSelected: (value) async {
              if (value == 'keep') {
                final status = await bridge.keepConnection();
                if (status != null) _snack(status == 'connected'
                  ? 'Mutual connection saved' : 'Request saved privately');
              } else if (value == 'report') {
                _reportSheet();
              } else if (value == 'block') {
                _confirmBlock();
              } else if (value == 'end') {
                await bridge.endChat();
              } else if (value == 'leave') {
                await bridge.leaveChat();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'keep', child: Text('Keep connection')),
              PopupMenuItem(value: 'report', child: Text('Report user')),
              PopupMenuItem(value: 'block', child: Text('Block user')),
              PopupMenuItem(value: 'end', child: Text('End random chat')),
              PopupMenuItem(value: 'leave', child: Text('Back to Discover')),
            ],
          ),
        ])),
      const Divider(height: 1),
      Expanded(child: bridge.messages.isEmpty
        ? const Center(child: Padding(padding: EdgeInsets.all(24),
            child: Text('Say hello. This chat is only visible to its participants.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFFA6A5BF)))))
        : ListView.builder(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
            itemCount: bridge.messages.length,
            itemBuilder: (context, index) {
              final msg = bridge.messages[index];
              final mine = msg['senderId'] != bridge.peerId;
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 300),
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
                  decoration: BoxDecoration(
                    color: mine ? const Color(0xFF6257A2) :
                      const Color(0xFF252B3D),
                    borderRadius: BorderRadius.circular(18)),
                  child: Text(msg['body']?.toString() ?? '',
                    style: const TextStyle(height: 1.4)),
                ),
              );
            })),
      if (bridge.pendingText != null)
        Padding(padding: const EdgeInsets.all(6), child: Text(
          'Last message not confirmed. Tap send to retry.',
          style: const TextStyle(color: Color(0xFFFFC6C6), fontSize: 12))),
      Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(children: [
          Expanded(child: TextField(
            controller: composer,
            minLines: 1,maxLines: 4,
            maxLength: 4000,
            maxLengthEnforcement: MaxLengthEnforcement.enforced,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'Message...', counterText: ''),
          )),
          const SizedBox(width: 10),
          IconButton.filled(
            tooltip: 'Send message',
            onPressed: bridge.busy ? null : () async {
              final text = composer.text.trim();
              if (text.isEmpty) return;
              final sent = await bridge.send(text);
              if (sent && mounted) composer.clear();
            },
            icon: bridge.busy
              ? const SizedBox(height: 20,width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.arrow_upward),
          ),
        ]),
      ),
    ]);
  }

  Future<void> _confirmBlock() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Block this person?'),
        content: const Text('They will be unable to message or match with '
          'you again. This action is enforced on the server.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true),
            child: const Text('Block')),
        ],
      ),
    );
    if (accepted == true) {
      final done = await bridge.blockPeer();
      if (done) _snack('Blocked');
    }
  }

  Future<void> _reportSheet() async {
    final category = await showModalBottomSheet<String>(context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(child: ListView(
        shrinkWrap: true,
        children: [
          const Padding(padding: EdgeInsets.all(18),
            child: Text('Report conversation', style: TextStyle(
              fontSize: 20, fontWeight: FontWeight.bold))),
          ...const {
            'harassment':'Harassment',
            'threat':'Threat or intimidation',
            'spam':'Spam',
            'impersonation':'Impersonation',
            'sexual_content':'Sexual content',
            'other':'Other',
          }.entries.map((item) => ListTile(title: Text(item.value),
            onTap: () => Navigator.pop(context, item.key))),
        ],
      )),
    );
    if (category != null) {
      final sent = await bridge.reportPeer(category);
      if (sent) _snack('Report received by the internal review queue');
    }
  }

  Widget _panel({required List<Widget> children}) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: const Color(0xFF212438).withValues(alpha: .95),
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: const Color(0xFF383B51), width: .7),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
  );
}
