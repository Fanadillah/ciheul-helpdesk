import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/theme.dart';

class LoginScreen extends StatefulWidget {
  final AppState state;

  const LoginScreen({super.key, required this.state});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final TextEditingController _server = TextEditingController(text: widget.state.apiBase);
  final _passwordFocus = FocusNode();

  bool _obscure = true;
  bool _loading = false;
  bool _showServer = false;
  String? _error;

  static const _demoAccounts = [
    ('Agent', 'agent@helpdesk.test', 'Agent123!'),
    ('Supervisor', 'supervisor@helpdesk.test', 'Super123!'),
    ('Admin', 'admin@helpdesk.test', 'Admin123!'),
    ('Customer', 'customer@helpdesk.test', 'Cust123!'),
  ];

  @override
  void initState() {
    super.initState();
    _error = widget.state.authNotice;
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _server.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Email dan password wajib diisi.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.state.login(email, password, baseUrl: _server.text);
    } on ApiException catch (err) {
      setState(() => _error = err.message);
    } catch (_) {
      setState(() => _error = 'Terjadi kesalahan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fillDemo(String email, String password) {
    setState(() {
      _email.text = email;
      _password.text = password;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0B1220), Color(0xFF111B2E), Color(0xFF172554)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            gradient: const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF7C3AED)]),
                            boxShadow: const [
                              BoxShadow(color: Color(0x553B82F6), blurRadius: 22, offset: Offset(0, 8)),
                            ],
                          ),
                          alignment: Alignment.center,
                          child: const Text(
                            'C',
                            style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Ciheul Helpdesk',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                            ),
                            Text(
                              'SUPPORT & TICKETING',
                              style: TextStyle(
                                color: Color(0xFF7C8AA3),
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Semua percakapan,\nsatu genggaman.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        height: 1.15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Masuk untuk memantau tiket dan membalas pelanggan secara real-time.',
                      style: TextStyle(color: Color(0xFFB6C2D6), fontSize: 13, height: 1.55),
                    ),
                    const SizedBox(height: 24),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: const [
                          BoxShadow(color: Color(0x33000000), blurRadius: 40, offset: Offset(0, 18)),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Masuk ke akun',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink),
                          ),
                          const SizedBox(height: 3),
                          const Text(
                            'Gunakan akun helpdesk perusahaan Anda.',
                            style: TextStyle(fontSize: 12, color: AppColors.muted),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 14),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF2F2),
                                borderRadius: BorderRadius.circular(9),
                                border: Border.all(color: const Color(0xFFFECACA)),
                              ),
                              child: Text(
                                _error!,
                                style: const TextStyle(fontSize: 12, color: Color(0xFFB91C1C)),
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          const _FieldLabel('Email'),
                          const SizedBox(height: 6),
                          TextField(
                            key: const Key('login_email'),
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.username],
                            decoration: const InputDecoration(
                              hintText: 'nama@perusahaan.com',
                              prefixIcon: Icon(Icons.alternate_email_rounded, size: 19),
                            ),
                            onSubmitted: (_) => _passwordFocus.requestFocus(),
                          ),
                          const SizedBox(height: 13),
                          const _FieldLabel('Password'),
                          const SizedBox(height: 6),
                          TextField(
                            key: const Key('login_password'),
                            controller: _password,
                            focusNode: _passwordFocus,
                            obscureText: _obscure,
                            textInputAction: TextInputAction.done,
                            autofillHints: const [AutofillHints.password],
                            decoration: InputDecoration(
                              hintText: 'Masukkan password',
                              prefixIcon: const Icon(Icons.lock_outline_rounded, size: 19),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                  size: 19,
                                  color: AppColors.soft,
                                ),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                            onSubmitted: (_) => _submit(),
                          ),
                          const SizedBox(height: 8),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton(
                              onPressed: () => setState(() => _showServer = !_showServer),
                              style: TextButton.styleFrom(
                                padding: EdgeInsets.zero,
                                minimumSize: const Size(0, 34),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              child: Text(
                                _showServer ? 'Sembunyikan alamat server' : 'Ubah alamat server',
                                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ),
                          if (_showServer) ...[
                            const SizedBox(height: 2),
                            const _FieldLabel('Alamat server'),
                            const SizedBox(height: 6),
                            TextField(
                              key: const Key('login_server'),
                              controller: _server,
                              keyboardType: TextInputType.url,
                              autocorrect: false,
                              decoration: const InputDecoration(
                                hintText: 'http://10.0.2.2:3000',
                                prefixIcon: Icon(Icons.dns_outlined, size: 19),
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Emulator Android: http://10.0.2.2:3000 · Perangkat fisik: gunakan IP LAN server.',
                              style: TextStyle(fontSize: 10.5, color: AppColors.soft, height: 1.5),
                            ),
                          ],
                          const SizedBox(height: 16),
                          SizedBox(
                            height: 48,
                            child: FilledButton(
                              key: const Key('login_submit'),
                              onPressed: _loading ? null : _submit,
                              child: _loading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                                    )
                                  : const Text('Masuk'),
                            ),
                          ),
                          const SizedBox(height: 18),
                          Row(
                            children: [
                              const Expanded(child: Divider()),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                child: Text(
                                  'AKUN DEMO',
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.soft,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ),
                              const Expanded(child: Divider()),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: _demoAccounts
                                .map(
                                  (account) => ActionChip(
                                    label: Text(
                                      account.$1,
                                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                                    ),
                                    onPressed: () => _fillDemo(account.$2, account.$3),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                )
                                .toList(),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      'Ciheul Technologies · Technical Test 2026',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF7C8AA3), fontSize: 10.5),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
    );
  }
}
