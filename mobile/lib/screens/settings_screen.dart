import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class SettingsScreen extends StatelessWidget {
  final AppState state;

  const SettingsScreen({super.key, required this.state});

  Future<void> _editServer(BuildContext context) async {
    final controller = TextEditingController(text: state.apiBase);
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Alamat server', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(hintText: 'http://192.168.1.10:3000'),
            ),
            const SizedBox(height: 8),
            const Text(
              'Emulator Android memakai http://10.0.2.2:3000. Perangkat fisik memakai IP LAN server.',
              style: TextStyle(fontSize: 11, color: AppColors.muted, height: 1.5),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (result == null || result.trim().isEmpty || !context.mounted) return;
    final ok = await state.changeServer(result);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'Alamat server diperbarui' : 'Server tidak dapat diakses'),
        backgroundColor: ok ? AppColors.ink : const Color(0xFF7F1D1D),
      ),
    );
  }

  Future<void> _logout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Keluar dari akun?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        content: const Text(
          'Pesan yang masih dalam antrean akan dihapus. Anda dapat login kembali kapan saja.',
          style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.5),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await state.logout();
    }
  }

  Future<void> _enableNotifications(BuildContext context) async {
    await state.notificationService.init(requestPermission: true);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          state.notificationService.isReady
              ? 'Notifikasi diaktifkan'
              : 'Notifikasi tidak didukung pada perangkat ini',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final user = state.user;
        if (user == null) return const SizedBox.shrink();
        return ListView(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 30),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF0F172A), Color(0xFF1E3A8A)],
                ),
                boxShadow: const [
                  BoxShadow(color: Color(0x221E3A8A), blurRadius: 22, offset: Offset(0, 10)),
                ],
              ),
              child: Row(
                children: [
                  UserAvatar(name: user.name, size: 52),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.name,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user.email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Color(0xFFB6C2D6), fontSize: 11.5),
                        ),
                        const SizedBox(height: 7),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            user.roleLabel,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            const _SectionLabel('KONEKSI'),
            const SizedBox(height: 7),
            _Card(
              children: [
                _Tile(
                  icon: Icons.dns_outlined,
                  title: 'Alamat server',
                  subtitle: state.apiBase,
                  trailing: const Icon(Icons.edit_outlined, size: 18, color: AppColors.soft),
                  onTap: () => _editServer(context),
                ),
                const Divider(),
                _Tile(
                  icon: Icons.wifi_tethering_rounded,
                  title: 'Status realtime',
                  subtitle: state.connected
                      ? 'Socket.IO terhubung, pesan masuk seketika'
                      : 'Terputus, memakai REST + antrean otomatis',
                  trailing: ConnectionPill(connected: state.connected, compact: true),
                ),
                const Divider(),
                _Tile(
                  icon: Icons.schedule_send_outlined,
                  title: 'Antrean pesan offline',
                  subtitle: state.pendingMessages == 0
                      ? 'Tidak ada pesan tertunda'
                      : '${state.pendingMessages} pesan menunggu koneksi',
                  trailing: state.pendingMessages == 0
                      ? null
                      : TextButton(
                          onPressed: state.flushQueue,
                          style: TextButton.styleFrom(
                            minimumSize: const Size(0, 32),
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: const Text('Kirim', style: TextStyle(fontSize: 11.5)),
                        ),
                ),
                const Divider(),
                _Tile(
                  icon: Icons.notifications_active_outlined,
                  title: 'Notifikasi lokal',
                  subtitle: state.notificationService.isReady
                      ? 'Aktif untuk pesan dan perubahan tiket'
                      : 'Aktifkan agar tidak melewatkan balasan baru',
                  trailing: state.notificationService.isReady
                      ? const Icon(Icons.check_circle_rounded, size: 19, color: AppColors.success)
                      : TextButton(
                          onPressed: () => _enableNotifications(context),
                          style: TextButton.styleFrom(
                            minimumSize: const Size(0, 32),
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: const Text('Aktifkan', style: TextStyle(fontSize: 11.5)),
                        ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            const _SectionLabel('TENTANG APLIKASI'),
            const SizedBox(height: 7),
            _Card(
              children: const [
                _Tile(
                  icon: Icons.phone_android_rounded,
                  title: 'Ciheul Helpdesk Mobile',
                  subtitle: 'Versi 1.0.0 · Flutter + Socket.IO',
                ),
                Divider(),
                _Tile(
                  icon: Icons.bolt_rounded,
                  title: 'Dibangun untuk tim support',
                  subtitle: 'Realtime chat, antrean offline, dan notifikasi lokal',
                ),
                Divider(),
                _Tile(
                  icon: Icons.storage_rounded,
                  title: 'Backend',
                  subtitle: 'Node.js · Express · Socket.IO · SQLite',
                ),
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              height: 46,
              child: OutlinedButton.icon(
                onPressed: () => _logout(context),
                icon: const Icon(Icons.logout_rounded, size: 18, color: AppColors.danger),
                label: const Text(
                  'Keluar dari akun',
                  style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 13),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFFFECACA)),
                  backgroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w800,
        color: AppColors.soft,
        letterSpacing: 1,
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(children: children),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 19, color: AppColors.muted),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10.5, color: AppColors.muted, height: 1.45),
                ),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: content,
    );
  }
}
