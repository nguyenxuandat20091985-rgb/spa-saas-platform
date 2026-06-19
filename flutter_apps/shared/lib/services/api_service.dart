import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/api_endpoints.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final String? code;

  ApiException({required this.statusCode, required this.message, this.code});

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiService {
  final http.Client _client;
  String? _accessToken;
  String? _refreshToken;

  ApiService({http.Client? client}) : _client = client ?? http.Client();

  String get baseUrl => ApiEndpoints.baseUrl;

  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_accessToken != null) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    return headers;
  }

  Future<void> loadTokens() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString('access_token');
    _refreshToken = prefs.getString('refresh_token');
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', accessToken);
    await prefs.setString('refresh_token', refreshToken);
  }

  Future<void> clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
  }

  bool get isAuthenticated => _accessToken != null;

  Future<Map<String, dynamic>> get(String endpoint, {Map<String, String>? queryParams}) async {
    final uri = Uri.parse('$baseUrl$endpoint').replace(queryParameters: queryParams);
    final response = await _client.get(uri, headers: _headers);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> post(String endpoint, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final response = await _client.post(uri, headers: _headers, body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> put(String endpoint, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final response = await _client.put(uri, headers: _headers, body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> patch(String endpoint, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final response = await _client.patch(uri, headers: _headers, body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> delete(String endpoint) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final response = await _client.delete(uri, headers: _headers);
    return _handleResponse(response);
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final body = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    final error = body['error'] as Map<String, dynamic>?;
    throw ApiException(
      statusCode: response.statusCode,
      message: error?['message'] as String? ?? 'Unknown error',
      code: error?['code'] as String?,
    );
  }

  // Auth methods
  Future<Map<String, dynamic>> login(String email, String password) async {
    final result = await post(ApiEndpoints.login, body: {
      'email': email,
      'password': password,
    });
    final data = result['data'] as Map<String, dynamic>;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return data;
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
    String role = 'customer',
    String? tenantName,
  }) async {
    final result = await post(ApiEndpoints.register, body: {
      'email': email,
      'password': password,
      'fullName': fullName,
      if (phone != null) 'phone': phone,
      'role': role,
      if (tenantName != null) 'tenantName': tenantName,
    });
    final data = result['data'] as Map<String, dynamic>;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return data;
  }

  Future<void> logout() async {
    try {
      await delete(ApiEndpoints.profile.replaceAll('profile', 'logout'));
    } finally {
      await clearTokens();
    }
  }

  Future<Map<String, dynamic>> getProfile() async {
    final result = await get(ApiEndpoints.profile);
    return result['data'] as Map<String, dynamic>;
  }
}
