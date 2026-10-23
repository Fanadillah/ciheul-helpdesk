import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../core/socket_service.dart';
import '../widgets/common.dart';

class TicketDetailScreen extends StatefulWidget {
  final AppState state;
  final String ticketId;
  final Ticket? initialTicket;

  const TicketDetailScreen({
    super.key,
    required this.state,
    required this.ticketId,
    this.initialTicket,
  });

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Ticket? _ticket;
  List<Message> _messages = [];
  bool _loading = true;
  bool _sending = false;
  bool _internal = false;
  String? _error;
  String? _typingName;
  Timer? _typingClear;
  Timer? _typingDebounce;
  StreamSubscription<SocketEvent>? _socketSub;

  final _input = TextEditingController();
  final _scroll = ScrollController();

  bool get _isStaff => widget.state.isStaff;
  bool get _closed => _ticket?.isClosed ?? false;

  @override
  void initState() {
    super.initState();
    _ticket = widget.initialTicket;
    widget.state.setActiveTicket(widget.ticketId);
    if (widget.state.isStaff) widget.state.loadStaffExtras();
    _socketSub = widget.state.socket.events.listen(_onSocketEvent);
    _load();
  }

  @override
  void dispose() {
    _socketSub?.cancel();
    _typingClear?.cancel();
    _typingDebounce?.cancel();
    widget.state.socket.leaveTicket(widget.ticketId);
    widget.state.setActiveTicket(null);
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onSocketEvent(SocketEvent event) {
    if (!mounted) return;
    switch (event.name) {
      case 'message:new':
        final message = Message.fromJson(event.data);
        if (message.ticketId != widget.ticketId) return;
        _merge([message]);
        if (message.senderId != widget.state.user?.id) {
          widget.state.socket.markRead(widget.ticketId, message.id);
        }
        setState(() {});
        _scrollToBottom();
        break;
      case 'ticket:update':
        final ticket = Ticket.fromJson(event.data);
        if (ticket.id != widget.ticketId) return;
        setState(() => _ticket = ticket);
        break;
      case 'connect':
        widget.state.socket.joinTicket(widget.ticketId, _lastSeq);
        _load(silent: true);
        break;
      case 'typing':
        if (event.data['ticket_id'] != widget.ticketId) return;
        if (event.data['user_id'] == widget.state.user?.id) return;
        final isTyping = event.data['is_typing'] == true;
        setState(() => _typingName = isTyping ? (event.data['name'] as String? ?? 'Agent') : null);
        _typingClear?.cancel();
        if (isTyping) {
          _typingClear = Timer(const Duration(seconds: 4), () {
            if (mounted) setState(() => _typingName = null);
          });
        }
        break;
      default:
        break;
    }
  }

  int get _lastSeq => _messages.fold(0, (max, m) => m.seq > max ? m.seq : max);

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = _ticket == null);
    try {
      final ticket = await widget.state.getTicket(widget.ticketId);
      final messages = await widget.state.getMessages(widget.ticketId);
      if (!mounted) return;
      setState(() {
        _ticket = ticket;
        _messages = messages;
        _sortMessages();
        _loading = false;
        _error = null;
      });
      if (widget.state.socket.isConnected) {
        widget.state.socket.joinTicket(widget.ticketId, _lastSeq);
      }
      final last = _messages.isNotEmpty ? _messages.last : null;
      if (last != null) widget.state.socket.markRead(widget.ticketId, last.id);
      _scrollToBottom();
    } on ApiException catch (err) {
      if (err.isUnauthorized) {
        await widget.state.logout(notice: 'Sesi berakhir. Silakan login kembali.');
        return;
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = err.message;
      });
    }
  }

  void _merge(List<Message> incoming) {
    for (final message in incoming) {
      final byId = message.id.isNotEmpty ? _messages.indexWhere((m) => m.id == message.id) : -1;
      final byClient = message.clientMessageId != null
          ? _messages.indexWhere((m) => m.clientMessageId == message.clientMessageId)
          : -1;
      final index = byId >= 0 ? byId : byClient;
      if (index >= 0) {
        _messages[index] = message;
      } else {
        _messages.add(message);
      }
    }
    _sortMessages();
  }

  void _sortMessages() {
    _messages.sort((a, b) {
      if (a.seq == 0 && b.seq == 0) return a.createdAt.compareTo(b.createdAt);
      if (a.seq == 0) return 1;
      if (b.seq == 0) return -1;
      return a.seq.compareTo(b.seq);
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 120,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOut,
      );
    });
  }

  String _newClientId() => '${DateTime.now().microsecondsSinceEpoch}-${DateTime.now().millisecond}';

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending || _ticket == null || _closed) return;
    final clientId = _newClientId();
    final user = widget.state.user;
    final optimistic = Message(
      id: 'tmp-$clientId',
      ticketId: widget.ticketId,
      senderId: user?.id,
      senderType: _isStaff ? 'agent' : 'customer',
      senderName: user?.name ?? '',
      body: text,
      isInternal: _internal,
      clientMessageId: clientId,
      createdAt: DateTime.now().toIso8601String(),
      pending: true,
    );

    setState(() {
      _messages.add(optimistic);
      _sortMessages();
      _sending = true;
      _input.clear();
    });
    _scrollToBottom();

    final internal = _internal;
    try {
      final outcome = await widget.state.sendMessage(
        ticketId: widget.ticketId,
        body: text,
        internal: internal,
        clientMessageId: clientId,
      );
      if (!mounted) return;
      if (outcome.message != null) {
        setState(() {
          final index = _messages.indexWhere((m) => m.clientMessageId == clientId);
          if (index >= 0) _messages[index] = outcome.message!;
          _internal = false;
          _sortMessages();
        });
      } else if (outcome.queued) {
        _snack('Pesan masuk antrean dan akan terkirim otomatis saat online.');
      } else if (outcome.error != null) {
        setState(() {
          final index = _messages.indexWhere((m) => m.clientMessageId == clientId);
          if (index >= 0) _messages[index] = _messages[index].copyWith(pending: false, failed: true);
        });
        _snack(outcome.error!, error: true);
      }
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  Future<void> _patch(Map<String, dynamic> patch, {String? successMessage}) async {
    try {
      final ticket = await widget.state.patchTicket(widget.ticketId, patch);
      if (!mounted) return;
      setState(() => _ticket = ticket);
      if (successMessage != null) _snack(successMessage);
    } on ApiException catch (err) {
      if (mounted) _snack(err.message, error: true);
    }
  }

  Future<void> _aiReply() async {
    _snack('AI sedang menyusun balasan...');
    try {
      await widget.state.generateAiReply(widget.ticketId);
      await Future.delayed(const Duration(milliseconds: 1600));
      await _load(silent: true);
      if (mounted) _snack('Balasan AI dibuat');
    } on ApiException catch (err) {
      if (mounted) _snack(err.message, error: true);
    }
  }

  Future<void> _reopen() async {
    try {
      final ticket = await widget.state.reopenTicket(widget.ticketId);
      if (!mounted) return;
      setState(() => _ticket = ticket);
      _snack('Tiket dibuka kembali');
    } on ApiException catch (err) {
      if (mounted) _snack(err.message, error: true);
    }
  }

  Future<void> _rate(int rating) async {
    try {
      final ticket = await widget.state.submitCsat(widget.ticketId, rating);
      if (!mounted) return;
      setState(() => _ticket = ticket);
      _snack('Terima kasih atas penilaian Anda!');
    } on ApiException catch (err) {
      if (mounted) _snack(err.message, error: true);
    }
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? const Color(0xFF7F1D1D) : AppColors.ink,
      ),
    );
  }

  void _onTyping(String value) {
    _typingDebounce?.cancel();
    if (value.trim().isEmpty) return;
    widget.state.socket.typing(widget.ticketId, true);
    _typingDebounce = Timer(const Duration(seconds: 2), () {
      widget.state.socket.typing(widget.ticketId, false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final ticket = _ticket;
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ticket?.code ?? 'Memuat...',
              style: const TextStyle(fontSize: 10.5, color: AppColors.muted, fontWeight: FontWeight.w600),
            ),
            Text(
              ticket?.subject ?? 'Detail tiket',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Info tiket',
            onPressed: ticket == null ? null : _showInfo,
            icon: const Icon(Icons.info_outline_rounded, size: 21),
          ),
          PopupMenuButton<String>(
            tooltip: 'Aksi',
            onSelected: (value) {
              switch (value) {
                case 'ai':
                  _aiReply();
                  break;
                case 'claim':
                  final user = widget.state.user;
                  if (user != null) _patch({'assignee_id': user.id}, successMessage: 'Tiket diambil');
                  break;
                case 'resolve':
                  _patch({'status': 'resolved'}, successMessage: 'Tiket ditandai selesai');
                  break;
                case 'reopen':
                  _reopen();
                  break;
                case 'info':
                  _showInfo();
                  break;
              }
            },
            itemBuilder: (context) => [
              if (_isStaff) const PopupMenuItem(value: 'ai', child: Text('Buat balasan AI')),
              if (_isStaff) const PopupMenuItem(value: 'claim', child: Text('Ambil tiket ini')),
              if (_isStaff && !_closed) const PopupMenuItem(value: 'resolve', child: Text('Tandai selesai')),
              if (_closed) const PopupMenuItem(value: 'reopen', child: Text('Buka kembali tiket')),
              const PopupMenuItem(value: 'info', child: Text('Info tiket')),
            ],
          ),
        ],
      ),
      body: _loading && ticket == null
          ? const Center(child: CircularProgressIndicator())
          : _error != null && ticket == null
              ? EmptyView(
                  icon: Icons.cloud_off_rounded,
                  title: 'Tidak dapat memuat tiket',
                  message: _error!,
                  action: FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi')),
                )
              : Column(
                  children: [
                    _header(ticket!),
                    Expanded(
                      child: RefreshIndicator(
                        color: AppColors.primary,
                        onRefresh: () => _load(silent: true),
                        child: _messages.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: const [
                                  SizedBox(height: 90),
                                  EmptyView(
                                    icon: Icons.forum_outlined,
                                    title: 'Belum ada pesan',
                                    message: 'Kirim pesan pertama untuk memulai percakapan.',
                                  ),
                                ],
                              )
                            : ListView.builder(
                                controller: _scroll,
                                padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
                                itemCount: _messages.length,
                                itemBuilder: (context, index) {
                                  final message = _messages[index];
                                  final prev = index > 0 ? _messages[index - 1] : null;
                                  final showDay = prev == null ||
                                      dayLabel(prev.createdAt) != dayLabel(message.createdAt);
                                  return Column(
                                    children: [
                                      if (showDay) _dayDivider(dayLabel(message.createdAt)),
                                      _bubble(message),
                                    ],
                                  );
                                },
                              ),
                      ),
                    ),
                    if (_typingName != null)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.only(left: 20, bottom: 2),
                        child: Text(
                          '$_typingName sedang mengetik...',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.soft,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    _composer(ticket),
                  ],
                ),
    );
  }

  Widget _header(Ticket ticket) {
    final sla = ticket.sla;
    final late = sla.resolutionBreached || sla.firstResponseBreached;
    return Container(
      width: double.infinity,
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Row(
        children: [
          StatusChip(status: ticket.status),
          const SizedBox(width: 6),
          PriorityChip(priority: ticket.priority),
          const SizedBox(width: 8),
          if (ticket.assigneeName != null && ticket.assigneeName!.isNotEmpty)
            Flexible(
              child: Text(
                'Agent: ${ticket.assigneeName}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, color: AppColors.muted),
              ),
            ),
          const Spacer(),
          if (ticket.isOpen && sla.resolutionDueIn != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: late
                    ? const Color(0xFFFEF2F2)
                    : sla.resolutionDueIn! < 3600
                        ? const Color(0xFFFFFBEB)
                        : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.timer_outlined,
                    size: 12,
                    color: late
                        ? AppColors.danger
                        : sla.resolutionDueIn! < 3600
                            ? AppColors.warning
                            : AppColors.muted,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    late ? 'SLA terlampaui' : 'SLA ${durationLabel(sla.resolutionDueIn)}',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: late
                          ? AppColors.danger
                          : sla.resolutionDueIn! < 3600
                              ? AppColors.warning
                              : AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _dayDivider(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 2),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFFEEF2F7),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }

  Widget _bubble(Message message) {
    final user = widget.state.user;
    final isMine = message.isCustomer ? !_isStaff : (_isStaff && message.senderType != 'ai');
    final isInternal = message.isInternal;
    final isAi = message.isAi;

    Color background;
    Color foreground;
    Color? borderColor;
    if (isInternal) {
      background = const Color(0xFFFFFBEB);
      foreground = const Color(0xFF78350F);
      borderColor = const Color(0xFFFDE68A);
    } else if (isMine) {
      background = AppColors.primary;
      foreground = Colors.white;
      borderColor = AppColors.primary;
    } else if (isAi) {
      background = const Color(0xFFFAF5FF);
      foreground = AppColors.ink;
      borderColor = const Color(0xFFE9D5FF);
    } else {
      background = Colors.white;
      foreground = AppColors.ink;
      borderColor = AppColors.line;
    }

    final name = message.senderType == 'ai'
        ? 'Helpdesk AI'
        : (message.senderName.isEmpty ? (isMine ? (user?.name ?? 'Anda') : 'Customer') : message.senderName);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isMine) ...[
            UserAvatar(
              name: name,
              size: 30,
              customer: message.isCustomer,
              ai: message.isAi,
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 2, right: 2, bottom: 4),
                  child: Text(
                    isMine ? 'Anda' : name,
                    style: const TextStyle(fontSize: 10.5, color: AppColors.soft, fontWeight: FontWeight.w600),
                  ),
                ),
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.74),
                  padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
                  decoration: BoxDecoration(
                    color: background,
                    border: Border.all(color: borderColor),
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(14),
                      topRight: const Radius.circular(14),
                      bottomLeft: Radius.circular(isMine ? 14 : 5),
                      bottomRight: Radius.circular(isMine ? 5 : 14),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (isInternal)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 5),
                          child: Text(
                            'CATATAN INTERNAL',
                            style: TextStyle(
                              fontSize: 8.5,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFB45309),
                              letterSpacing: 0.7,
                            ),
                          ),
                        ),
                      Text(
                        message.body,
                        style: TextStyle(fontSize: 13, height: 1.45, color: foreground),
                      ),
                      if (message.attachments.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        ...message.attachments.map(
                          (a) => Container(
                            margin: const EdgeInsets.only(top: 3),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                            decoration: BoxDecoration(
                              color: isMine ? Colors.white24 : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(7),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.attach_file_rounded,
                                  size: 13,
                                  color: isMine ? Colors.white : AppColors.muted,
                                ),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    a.originalName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 10.5, color: isMine ? Colors.white : AppColors.muted),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 2, right: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        message.pending
                            ? 'Mengirim...'
                            : message.failed
                                ? 'Gagal terkirim'
                                : formatClock(message.createdAt),
                        style: TextStyle(
                          fontSize: 9.5,
                          color: message.failed ? AppColors.danger : AppColors.soft,
                          fontWeight: message.failed ? FontWeight.w700 : FontWeight.w400,
                        ),
                      ),
                      if (isMine && !message.pending && !message.failed) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.done_all_rounded, size: 12, color: AppColors.primary),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _composer(Ticket ticket) {
    if (_closed) {
      final canRate = !_isStaff && ticket.status == 'resolved' && ticket.csatRating == null;
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(
                  ticket.status == 'resolved' ? Icons.check_circle_rounded : Icons.lock_outline_rounded,
                  size: 19,
                  color: AppColors.success,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    ticket.status == 'resolved' ? 'Tiket telah selesai.' : 'Tiket telah ditutup.',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink),
                  ),
                ),
                TextButton(
                  onPressed: _reopen,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 34),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                  child: const Text('Buka kembali', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            if (canRate) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: Column(
                  children: [
                    const Text(
                      'Bagaimana pengalaman Anda?',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF78350F)),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(5, (index) {
                        return IconButton(
                          onPressed: () => _rate(index + 1),
                          icon: const Icon(Icons.star_rounded),
                          color: const Color(0xFFF59E0B),
                          iconSize: 30,
                          visualDensity: VisualDensity.compact,
                        );
                      }),
                    ),
                  ],
                ),
              ),
            ],
            if (!_isStaff && ticket.csatRating != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    const Icon(Icons.star_rounded, size: 16, color: Color(0xFFF59E0B)),
                    const SizedBox(width: 4),
                    Text(
                      'Terima kasih! Anda memberi ${ticket.csatRating}/5.',
                      style: const TextStyle(fontSize: 11.5, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
    }

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      padding: EdgeInsets.fromLTRB(12, 8, 12, 10 + MediaQuery.of(context).viewPadding.bottom * 0.2),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (_isStaff)
                GestureDetector(
                  onTap: () => setState(() => _internal = !_internal),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    decoration: BoxDecoration(
                      color: _internal ? const Color(0xFFFFFBEB) : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: _internal ? const Color(0xFFFCD34D) : AppColors.line,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _internal ? Icons.sticky_note_2_rounded : Icons.chat_bubble_outline_rounded,
                          size: 13,
                          color: _internal ? const Color(0xFFB45309) : AppColors.muted,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _internal ? 'Catatan internal' : 'Balas customer',
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: _internal ? const Color(0xFFB45309) : AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              if (_isStaff && widget.state.cannedResponses.isNotEmpty) ...[
                const SizedBox(width: 6),
                PopupMenuButton<CannedResponse>(
                  tooltip: 'Balasan cepat',
                  onSelected: (value) {
                    _input.text = value.body;
                    _input.selection = TextSelection.collapsed(offset: _input.text.length);
                  },
                  itemBuilder: (context) => widget.state.cannedResponses
                      .map(
                        (c) => PopupMenuItem(
                          value: c,
                          child: SizedBox(
                            width: 240,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(c.title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                                Text(
                                  c.body,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 10.5, color: AppColors.muted),
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                      .toList(),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.bolt_rounded, size: 14, color: AppColors.muted),
                        SizedBox(width: 3),
                        Text(
                          'Balasan cepat',
                          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              if (widget.state.pendingMessages > 0) ...[
                const Spacer(),
                Text(
                  '${widget.state.pendingMessages} antrean',
                  style: const TextStyle(fontSize: 10, color: AppColors.warning, fontWeight: FontWeight.w600),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: _onTyping,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: _internal ? 'Tulis catatan internal...' : 'Tulis balasan...',
                      isDense: true,
                      fillColor: const Color(0xFFF8FAFC),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 44,
                  height: 44,
                  child: FilledButton(
                    onPressed: _sending ? null : _send,
                    style: FilledButton.styleFrom(
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.send_rounded, size: 19),
                  ),
                ),
              ],
            ),
          ],
        ),
    );
  }

  Future<void> _showInfo() async {
    final ticket = _ticket;
    if (ticket == null) return;
    await widget.state.loadStaffExtras();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheet) {
            final current = _ticket ?? ticket;
            const transitions = {
              'new': ['assigned', 'in_progress'],
              'assigned': ['in_progress', 'pending', 'resolved'],
              'in_progress': ['pending', 'resolved'],
              'pending': ['in_progress', 'resolved', 'closed'],
              'resolved': ['closed', 'in_progress'],
              'closed': ['in_progress'],
            };
            final nextStatuses = transitions[current.status] ?? const <String>[];
            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
              ),
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 38,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: AppColors.line,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            current.subject,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close_rounded, size: 20),
                        ),
                      ],
                    ),
                    Text(
                      current.code,
                      style: const TextStyle(fontSize: 11, color: AppColors.soft, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 16),
                    _infoRow('Pelanggan', current.customerName),
                    _infoRow('Email', current.customerEmail),
                    _infoRow('Status', statusLabel(current.status)),
                    _infoRow('Prioritas', priorityLabel(current.priority)),
                    _infoRow('Kategori', current.categoryName ?? '-'),
                    _infoRow('Channel', current.channel),
                    _infoRow('Dibuat', formatDateTime(current.createdAt)),
                    _infoRow('Respon pertama', current.firstResponseAt == null ? 'Belum' : formatDateTime(current.firstResponseAt)),
                    _infoRow('Agent', current.assigneeName ?? '-'),
                    _infoRow(
                      'SLA resolusi',
                      current.sla.resolutionDueIn == null
                          ? '-'
                          : current.sla.resolutionDueIn! < 0
                              ? 'Terlambat ${durationLabel(current.sla.resolutionDueIn)}'
                              : '${durationLabel(current.sla.resolutionDueIn)} lagi',
                    ),
                    if (current.csatRating != null)
                      _infoRow('CSAT', '${current.csatRating}/5 ${current.csatComment ?? ''}'),
                    if (_isStaff) ...[
                      const SizedBox(height: 16),
                      const Text(
                        'UBAH STATUS',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.soft, letterSpacing: 0.8),
                      ),
                      const SizedBox(height: 7),
                      Wrap(
                        spacing: 7,
                        runSpacing: 7,
                        children: nextStatuses.map((status) {
                          return ActionChip(
                            label: Text(
                              statusLabel(status),
                              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                            ),
                            onPressed: () async {
                              await _patch({'status': status}, successMessage: 'Status diperbarui');
                              if (context.mounted) Navigator.pop(context);
                            },
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'TUGASKAN KE',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.soft, letterSpacing: 0.8),
                      ),
                      const SizedBox(height: 7),
                      DropdownButtonFormField<String?>(
                        initialValue: widget.state.agents.any((a) => a.id == current.assigneeId)
                            ? current.assigneeId
                            : null,
                        items: [
                          const DropdownMenuItem<String?>(value: null, child: Text('Belum ditugaskan')),
                          ...widget.state.agents.map(
                            (agent) => DropdownMenuItem<String?>(
                              value: agent.id,
                              child: Text(agent.name),
                            ),
                          ),
                        ],
                        onChanged: (value) async {
                          await _patch({'assignee_id': value}, successMessage: 'Assignee diperbarui');
                          setSheet(() {});
                        },
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () {
                                Navigator.pop(context);
                                _aiReply();
                              },
                              icon: const Icon(Icons.auto_awesome_rounded, size: 16),
                              label: const Text('Balasan AI'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (!current.isClosed)
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: () async {
                                  await _patch({'status': 'resolved'}, successMessage: 'Tiket selesai');
                                  if (context.mounted) Navigator.pop(context);
                                },
                                icon: const Icon(Icons.check_rounded, size: 16),
                                label: const Text('Selesaikan'),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}
