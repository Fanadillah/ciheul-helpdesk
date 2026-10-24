import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _tried = false;

  bool get isReady => _ready;

  Future<void> init({bool requestPermission = true}) async {
    if (_ready) return;
    if (_tried && !requestPermission) return;
    _tried = true;
    if (kIsWeb) return;
    try {
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iOS = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      const settings = InitializationSettings(android: android, iOS: iOS);
      await _plugin.initialize(settings: settings);
      if (requestPermission) {
        await _plugin
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      }
      _ready = true;
    } catch (_) {
      // Local notification opsional. Lewati kalau platform tidak mendukung.
      _ready = false;
    }
  }

  Future<void> show(String title, String body, {String? ticketId}) async {
    if (!_ready) return;
    try {
      const details = NotificationDetails(
        android: AndroidNotificationDetails(
          'helpdesk_messages',
          'Pesan Helpdesk',
          channelDescription: 'Notifikasi pesan tiket dan perubahan status',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      );
      await _plugin.show(
        id: DateTime.now().millisecondsSinceEpoch.remainder(1 << 31),
        title: title,
        body: body,
        notificationDetails: details,
        payload: ticketId,
      );
    } catch (_) {
      // Abaikan error notifikasi.
    }
  }
}
