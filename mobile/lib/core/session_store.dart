import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class SessionStore {
  static const _kToken = 'auth_token';
  static const _kUser = 'auth_user';
  static const _kApiBase = 'api_base';
  static const _kQueue = 'send_queue';

  Future<String?> token() async => (await SharedPreferences.getInstance()).getString(_kToken);

  Future<Map<String, dynamic>?> user() async {
    final raw = (await SharedPreferences.getInstance()).getString(_kUser);
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<String?> apiBase() async => (await SharedPreferences.getInstance()).getString(_kApiBase);

  Future<void> saveSession(String token, Map<String, dynamic> user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, token);
    await prefs.setString(_kUser, jsonEncode(user));
  }

  Future<void> saveApiBase(String baseUrl) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kApiBase, baseUrl);
  }

  Future<List<Map<String, dynamic>>> queue() async {
    final raw = (await SharedPreferences.getInstance()).getString(_kQueue);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveQueue(List<Map<String, dynamic>> queue) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kQueue, jsonEncode(queue));
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kUser);
    await prefs.remove(_kQueue);
  }
}
