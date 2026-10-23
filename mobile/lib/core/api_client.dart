import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  final int status;

  const ApiException(this.message, this.status);

  bool get isNetwork => status == 0;
  bool get isUnauthorized => status == 401;

  @override
  String toString() => message;
}

class ApiClient {
  String baseUrl;
  String? token;

  ApiClient({required this.baseUrl, this.token});

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final uri = Uri.parse('$base$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: {...uri.queryParameters, ...query});
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, {Map<String, dynamic>? body}) =>
      _send('POST', path, body: body);

  Future<dynamic> patch(String path, {Map<String, dynamic>? body}) =>
      _send('PATCH', path, body: body);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final headers = <String, String>{
      'accept': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
    };
    if (body != null) headers['content-type'] = 'application/json';

    http.Response response;
    try {
      final request = http.Request(method, _uri(path, query))..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await request.send().timeout(const Duration(seconds: 18));
      response = await http.Response.fromStream(streamed);
    } on SocketException {
      throw const ApiException(
        'Tidak dapat terhubung ke server. Periksa koneksi dan alamat server.',
        0,
      );
    } catch (_) {
      throw const ApiException('Koneksi ke server terputus. Coba lagi.', 0);
    }

    dynamic data;
    if (response.body.isNotEmpty) {
      try {
        data = jsonDecode(response.body);
      } catch (_) {
        data = null;
      }
    }

    if (response.statusCode >= 400) {
      final message = data is Map && data['error'] is Map
          ? (data['error']['message'] ?? 'Permintaan gagal')
          : 'Permintaan gagal (${response.statusCode})';
      throw ApiException(message.toString(), response.statusCode);
    }
    return data;
  }
}
