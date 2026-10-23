import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

class SocketEvent {
  final String name;
  final Map<String, dynamic> data;

  const SocketEvent(this.name, this.data);
}

class SocketService {
  sio.Socket? _socket;
  final _controller = StreamController<SocketEvent>.broadcast();
  final ValueNotifier<bool> connected = ValueNotifier<bool>(false);

  Stream<SocketEvent> get events => _controller.stream;
  bool get isConnected => connected.value;

  void connect(String baseUrl, String token) {
    disconnect();
    try {
      final socket = sio.io(
        baseUrl,
        sio.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .disableAutoConnect()
            .setAuth({'token': token})
            .enableReconnection()
            .setReconnectionAttempts(99999)
            .setReconnectionDelay(800)
            .setReconnectionDelayMax(5000)
            .build(),
      );

      socket.onConnect((_) {
        connected.value = true;
        _controller.add(const SocketEvent('connect', {}));
      });
      socket.onDisconnect((_) {
        connected.value = false;
        _controller.add(const SocketEvent('disconnect', {}));
      });
      socket.onConnectError((_) {
        connected.value = false;
        _controller.add(const SocketEvent('connect_error', {}));
      });
      socket.onReconnect((_) {
        connected.value = true;
        _controller.add(const SocketEvent('connect', {}));
      });

      for (final event in [
        'message:new',
        'message:read',
        'ticket:update',
        'ticket:created',
        'notification:new',
        'typing',
        'sla:breach',
      ]) {
        socket.on(event, (dynamic data) {
          if (data is Map) {
            _controller.add(SocketEvent(event, Map<String, dynamic>.from(data)));
          }
        });
      }

      socket.connect();
      _socket = socket;
    } catch (err) {
      connected.value = false;
      _controller.add(SocketEvent('connect_error', {'error': err.toString()}));
    }
  }

  void emit(String event, [Map<String, dynamic>? data]) {
    if (_socket != null && _socket!.connected) {
      _socket!.emit(event, data ?? const {});
    }
  }

  void joinTicket(String ticketId, int lastSeq) {
    emit('ticket:join', {'ticket_id': ticketId, 'last_seq': lastSeq});
  }

  void leaveTicket(String ticketId) {
    emit('ticket:leave', {'ticket_id': ticketId});
  }

  void typing(String ticketId, bool isTyping) {
    emit('typing', {'ticket_id': ticketId, 'is_typing': isTyping});
  }

  void markRead(String ticketId, [String? messageId]) {
    emit('message:read', {
      'ticket_id': ticketId,
      if (messageId != null) 'message_id': messageId,
    });
  }

  void disconnect() {
    try {
      _socket?.dispose();
    } catch (_) {
      // ignore teardown errors
    }
    _socket = null;
    connected.value = false;
  }

  void dispose() {
    disconnect();
    _controller.close();
  }
}
