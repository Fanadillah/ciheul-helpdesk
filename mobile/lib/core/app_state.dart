import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart' hide Category;

import 'api_client.dart';
import 'format.dart';
import 'models.dart';
import 'notification_service.dart';
import 'session_store.dart';
import 'socket_service.dart';

String defaultApiBase() {
  const configured = String.fromEnvironment('API_BASE');
  if (configured.isNotEmpty) return configured;
  if (kIsWeb) return 'http://localhost:3000';
  if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

class AppState extends ChangeNotifier {
  final SessionStore _store = SessionStore();
  final SocketService socket = SocketService();
  final NotificationService notificationService = NotificationService();

  late ApiClient api;
  bool booting = true;
  User? user;
  String apiBase = defaultApiBase();
  String? authNotice;

  List<Ticket> tickets = [];
  List<Category> categories = [];
  List<AppNotification> notificationList = [];
  List<CannedResponse> cannedResponses = [];
  List<UserSummary> agents = [];

  final Set<String> unreadTicketIds = {};
  int pendingMessages = 0;
  String? activeTicketId;
  bool refreshing = false;
  bool _socketListening = false;
  bool _flushing = false;

  bool get isStaff => user?.isStaff ?? false;
  bool get connected => socket.isConnected;
  int get unreadNotifications => notificationList.where((n) => !n.isRead).length;
  int get unreadTickets => unreadTicketIds.length;

  Future<void> init() async {
    api = ApiClient(baseUrl: apiBase);
    try {
      final savedBase = await _store.apiBase();
      if (savedBase != null && savedBase.isNotEmpty) apiBase = savedBase;
      api = ApiClient(baseUrl: apiBase);
      pendingMessages = (await _store.queue()).length;
      await notificationService.init(requestPermission: false);

      final token = await _store.token();
      if (token != null && token.isNotEmpty) {
        api.token = token;
        try {
          final data = await api.get('/api/auth/me');
          user = User.fromJson(Map<String, dynamic>.from(data['user'] as Map));
          _afterLogin();
        } on ApiException catch (err) {
          if (err.isUnauthorized) {
            await _store.clearSession();
          }
          api.token = null;
        }
      }
    } catch (_) {
      // stay on the login screen when bootstrap fails
    } finally {
      booting = false;
      notifyListeners();
    }
  }

  Future<void> login(String email, String password, {String? baseUrl}) async {
    final normalized = baseUrl == null ? apiBase : normalizeBaseUrl(baseUrl);
    if (normalized == null) {
      throw const ApiException('Alamat server tidak valid', 400);
    }
    apiBase = normalized;
    api = ApiClient(baseUrl: apiBase);
    final data = await api.post('/api/auth/login', body: {
      'email': email.trim(),
      'password': password,
    });
    final token = data['token'] as String;
    final logged = User.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    api.token = token;
    user = logged;
    await _store.saveApiBase(apiBase);
    await _store.saveSession(token, logged.toJson());
    authNotice = null;
    _afterLogin();
    notifyListeners();
  }

  void _afterLogin() {
    socket.connect(apiBase, api.token!);
    if (!_socketListening) {
      _socketListening = true;
      socket.events.listen(_handleSocketEvent);
    }
    notificationService.init(requestPermission: true);
    loadAll();
    unawaited(flushQueue());
  }

  Future<void> loadAll() async {
    await Future.wait([
      refreshTickets(),
      refreshCategories(),
      refreshNotifications(),
    ]);
  }

  Future<void> refreshTickets() async {
    if (user == null) return;
    refreshing = true;
    notifyListeners();
    try {
      final data = await api.get('/api/tickets', query: {'limit': '100'});
      final list = (data['tickets'] as List?) ?? const [];
      tickets = list.map((t) => Ticket.fromJson(Map<String, dynamic>.from(t as Map))).toList();
    } on ApiException catch (err) {
      if (err.isUnauthorized) await logout(notice: 'Sesi berakhir. Silakan login kembali.');
    } catch (_) {
      // Pertahankan data terakhir kalau response tidak bisa diparse.
    } finally {
      refreshing = false;
      notifyListeners();
    }
  }

  Future<void> refreshCategories() async {
    if (user == null) return;
    try {
      final path = isStaff ? '/api/categories' : '/api/public/categories';
      final data = await api.get(path);
      final list = (data['categories'] as List?) ?? const [];
      categories = list.map((c) => Category.fromJson(Map<String, dynamic>.from(c as Map))).toList();
      notifyListeners();
    } catch (_) {
      // Kategori tidak wajib untuk render inbox.
    }
  }

  Future<void> refreshNotifications() async {
    if (user == null) return;
    try {
      final data = await api.get('/api/notifications');
      final list = (data['notifications'] as List?) ?? const [];
      notificationList =
          list.map((n) => AppNotification.fromJson(Map<String, dynamic>.from(n as Map))).toList();
      notifyListeners();
    } catch (_) {
      // ignore
    }
  }

  Future<void> loadStaffExtras() async {
    if (!isStaff) return;
    try {
      final results = await Future.wait([
        api.get('/api/canned-responses'),
        api.get('/api/users'),
      ]);
      final canned = (results[0]['canned_responses'] as List?) ?? const [];
      cannedResponses =
          canned.map((c) => CannedResponse.fromJson(Map<String, dynamic>.from(c as Map))).toList();
      final userList = (results[1]['users'] as List?) ?? const [];
      agents = userList
          .map((u) => UserSummary.fromJson(Map<String, dynamic>.from(u as Map)))
          .where((u) => ['agent', 'supervisor'].contains(u.role))
          .toList();
      notifyListeners();
    } catch (_) {
      // Data opsional; halaman tetap bisa dipakai tanpa ini.
    }
  }

  Future<Ticket> getTicket(String id) async {
    final data = await api.get('/api/tickets/$id');
    final ticket = Ticket.fromJson(Map<String, dynamic>.from(data['ticket'] as Map));
    _upsert(ticket);
    return ticket;
  }

  Future<List<Message>> getMessages(String ticketId, {int afterSeq = 0}) async {
    final data = await api.get(
      '/api/tickets/$ticketId/messages',
      query: {'after_seq': '$afterSeq'},
    );
    final list = (data['messages'] as List?) ?? const [];
    return list.map((m) => Message.fromJson(Map<String, dynamic>.from(m as Map))).toList();
  }

  Future<Ticket> createTicket({
    required String subject,
    required String description,
    required String categoryId,
  }) async {
    final data = await api.post('/api/tickets', body: {
      'subject': subject,
      'description': description,
      'category_id': categoryId,
      'channel': 'mobile',
    });
    final ticket = Ticket.fromJson(Map<String, dynamic>.from(data['ticket'] as Map));
    _upsert(ticket);
    notifyListeners();
    return ticket;
  }

  Future<SendOutcome> sendMessage({
    required String ticketId,
    required String body,
    bool internal = false,
    String? clientMessageId,
  }) async {
    final clientId = clientMessageId ?? _newClientId();
    final payload = {
      'body': body,
      'client_message_id': clientId,
      'is_internal': internal,
    };
    try {
      final data = await api.post('/api/tickets/$ticketId/messages', body: payload);
      final message = Message.fromJson(Map<String, dynamic>.from(data['message'] as Map));
      _touchTicket(ticketId, message);
      return SendOutcome(message: message);
    } on ApiException catch (err) {
      if (err.isUnauthorized) {
        await logout(notice: 'Sesi berakhir. Silakan login kembali.');
        return SendOutcome(error: err.message);
      }
      if (err.isNetwork || err.status >= 500 || err.status == 429) {
        await _enqueue({...payload, 'ticket_id': ticketId});
        return const SendOutcome(queued: true);
      }
      return SendOutcome(error: err.message);
    }
  }

  Future<void> _enqueue(Map<String, dynamic> payload) async {
    final queue = await _store.queue();
    if (!queue.any((q) => q['client_message_id'] == payload['client_message_id'])) {
      queue.add(payload);
      await _store.saveQueue(queue);
    }
    pendingMessages = queue.length;
    notifyListeners();
  }

  Future<void> flushQueue() async {
    if (user == null || _flushing || api.token == null) return;
    _flushing = true;
    try {
      final queue = await _store.queue();
      if (queue.isEmpty) {
        pendingMessages = 0;
        return;
      }
      final remaining = <Map<String, dynamic>>[];
      var sent = 0;
      for (final item in queue) {
        try {
          await api.post('/api/tickets/${item['ticket_id']}/messages', body: {
            'body': item['body'],
            'client_message_id': item['client_message_id'],
            'is_internal': item['is_internal'] ?? false,
          });
          sent += 1;
        } on ApiException catch (err) {
          if (err.isUnauthorized) {
            await logout(notice: 'Sesi berakhir. Silakan login kembali.');
            return;
          }
          if (err.isNetwork || err.status >= 500 || err.status == 429) {
            remaining.add(item);
          }
          // Pesan yang ditolak validasi dibuang supaya antrean tidak macet.
        } catch (_) {
          remaining.add(item);
        }
      }
      await _store.saveQueue(remaining);
      pendingMessages = remaining.length;
      if (sent > 0) await refreshTickets();
    } finally {
      _flushing = false;
      notifyListeners();
    }
  }

  Future<Ticket> patchTicket(String ticketId, Map<String, dynamic> patch) async {
    final data = await api.patch('/api/tickets/$ticketId', body: patch);
    final ticket = Ticket.fromJson(Map<String, dynamic>.from(data['ticket'] as Map));
    _upsert(ticket);
    notifyListeners();
    return ticket;
  }

  Future<Ticket> submitCsat(String ticketId, int rating, {String? comment}) async {
    final data = await api.post('/api/tickets/$ticketId/csat', body: {
      'rating': rating,
      if (comment != null && comment.isNotEmpty) 'comment': comment,
    });
    final ticket = Ticket.fromJson(Map<String, dynamic>.from(data['ticket'] as Map));
    _upsert(ticket);
    notifyListeners();
    return ticket;
  }

  Future<Ticket> reopenTicket(String ticketId) async {
    final data = await api.post('/api/tickets/$ticketId/reopen');
    final ticket = Ticket.fromJson(Map<String, dynamic>.from(data['ticket'] as Map));
    _upsert(ticket);
    notifyListeners();
    return ticket;
  }

  Future<void> generateAiReply(String ticketId) async {
    await api.post('/api/tickets/$ticketId/ai-reply');
  }

  Future<void> markNotificationRead(AppNotification notification) async {
    if (!notification.isRead) {
      try {
        await api.post('/api/notifications/${notification.id}/read');
      } catch (_) {
        // ignore
      }
      final index = notificationList.indexWhere((n) => n.id == notification.id);
      if (index >= 0) {
        notificationList[index] = AppNotification(
          id: notification.id,
          type: notification.type,
          title: notification.title,
          ticketId: notification.ticketId,
          readAt: DateTime.now().toIso8601String(),
          createdAt: notification.createdAt,
        );
        notifyListeners();
      }
    }
  }

  Future<void> markAllNotificationsRead() async {
    final unread = notificationList.where((n) => !n.isRead).toList();
    for (final notification in unread) {
      await markNotificationRead(notification);
    }
  }

  void setActiveTicket(String? id) {
    activeTicketId = id;
    if (id != null) unreadTicketIds.remove(id);
    notifyListeners();
  }

  Future<bool> changeServer(String rawUrl) async {
    final normalized = normalizeBaseUrl(rawUrl);
    if (normalized == null) return false;
    if (normalized == apiBase) return true;
    apiBase = normalized;
    api = ApiClient(baseUrl: apiBase, token: api.token);
    await _store.saveApiBase(apiBase);
    try {
      if (api.token != null) {
        final data = await api.get('/api/auth/me');
        user = User.fromJson(Map<String, dynamic>.from(data['user'] as Map));
        socket.connect(apiBase, api.token!);
        await loadAll();
      }
      notifyListeners();
      return true;
    } on ApiException {
      await logout(notice: 'Server baru tidak dapat diakses. Silakan login kembali.');
      return false;
    }
  }

  Future<void> logout({String? notice}) async {
    socket.disconnect();
    await _store.clearSession();
    user = null;
    api.token = null;
    tickets = [];
    notificationList = [];
    categories = [];
    cannedResponses = [];
    agents = [];
    unreadTicketIds.clear();
    pendingMessages = 0;
    activeTicketId = null;
    authNotice = notice;
    notifyListeners();
  }

  void _handleSocketEvent(SocketEvent event) {
    switch (event.name) {
      case 'connect':
        flushQueue();
        refreshTickets();
        refreshNotifications();
        notifyListeners();
        break;
      case 'disconnect':
      case 'connect_error':
        notifyListeners();
        break;
      case 'message:new':
        final message = Message.fromJson(event.data);
        _touchTicket(message.ticketId, message);
        final ticket = _find(message.ticketId);
        if (user != null && message.senderId != user!.id && activeTicketId != message.ticketId) {
          unreadTicketIds.add(message.ticketId);
          final sender = message.senderName.isEmpty ? 'Helpdesk' : message.senderName;
          notificationService.show(
            'Pesan baru dari $sender',
            '${ticket != null ? '#${ticket.code} ' : ''}${truncate(message.body, 90)}',
            ticketId: message.ticketId,
          );
        }
        notifyListeners();
        break;
      case 'ticket:update':
      case 'ticket:created':
        final ticket = Ticket.fromJson(event.data);
        _upsert(ticket);
        notifyListeners();
        break;
      case 'notification:new':
        final notification = AppNotification.fromJson(event.data);
        if (!notificationList.any((n) => n.id == notification.id)) {
          notificationList.insert(0, notification);
        }
        final duplicateOfOpenChat = notification.type == 'message' &&
            notification.ticketId != null &&
            notification.ticketId == activeTicketId;
        if (!duplicateOfOpenChat) {
          notificationService.show(notification.title, 'Buka aplikasi untuk melihat detail.');
        }
        notifyListeners();
        break;
      default:
        break;
    }
  }

  Ticket? _find(String id) {
    for (final ticket in tickets) {
      if (ticket.id == id) return ticket;
    }
    return null;
  }

  void _upsert(Ticket ticket) {
    final index = tickets.indexWhere((t) => t.id == ticket.id);
    if (index >= 0) {
      tickets[index] = ticket;
    } else {
      tickets.insert(0, ticket);
    }
    tickets.sort((a, b) {
      const rank = {'new': 0, 'assigned': 1, 'in_progress': 2, 'pending': 3, 'resolved': 4, 'closed': 5};
      final status = (rank[a.status] ?? 9).compareTo(rank[b.status] ?? 9);
      if (status != 0) return status;
      const priority = {'urgent': 0, 'high': 1, 'medium': 2, 'low': 3};
      final prio = (priority[a.priority] ?? 9).compareTo(priority[b.priority] ?? 9);
      if (prio != 0) return prio;
      return (b.updatedAt ?? '').compareTo(a.updatedAt ?? '');
    });
  }

  void _touchTicket(String ticketId, Message message) {
    final ticket = _find(ticketId);
    if (ticket == null) return;
    _upsert(ticket.copyWith(
      lastMessage: message.body,
      updatedAt: message.createdAt,
      messageCount: ticket.messageCount + 1,
    ));
    notifyListeners();
  }

  String _newClientId() {
    final random = Random();
    return '${DateTime.now().microsecondsSinceEpoch}-${random.nextInt(1 << 30)}';
  }

  @override
  void dispose() {
    socket.dispose();
    super.dispose();
  }
}
