import 'package:flutter/material.dart';

import 'core/app_state.dart';
import 'core/theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
  await state.init();
  runApp(HelpdeskApp(state: state));
}

class HelpdeskApp extends StatelessWidget {
  final AppState state;

  const HelpdeskApp({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ciheul Helpdesk',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: AnimatedBuilder(
        animation: state,
        builder: (context, _) {
          if (state.booting) return const _SplashScreen();
          if (state.user == null) return LoginScreen(state: state);
          return HomeShell(state: state);
        },
      ),
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0B1220), Color(0xFF1E3A8A)],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  gradient: const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF7C3AED)]),
                  boxShadow: const [
                    BoxShadow(color: Color(0x663B82F6), blurRadius: 30, offset: Offset(0, 14)),
                  ],
                ),
                alignment: Alignment.center,
                child: const Text(
                  'C',
                  style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Ciheul Helpdesk',
                style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 26),
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white70),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
