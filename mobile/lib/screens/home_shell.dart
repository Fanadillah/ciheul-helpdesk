import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'new_ticket_screen.dart';
import 'notifications_screen.dart';
import 'settings_screen.dart';
import 'ticket_detail_screen.dart';
import 'tickets_screen.dart';

class HomeShell extends StatefulWidget {
  final AppState state;

  const HomeShell({super.key, required this.state});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _index = 0;

  static const _titles = ['Tiket', 'Notifikasi', 'Pengaturan'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      widget.state.refreshTickets();
      widget.state.flushQueue();
    }
  }

  Future<void> _openTicket(String ticketId, {Ticket? ticket}) async {
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TicketDetailScreen(
          state: widget.state,
          ticketId: ticketId,
          initialTicket: ticket,
        ),
      ),
    );
    if (mounted) widget.state.refreshTickets();
  }

  Future<void> _createTicket() async {
    final created = await Navigator.of(context).push<Ticket>(
      MaterialPageRoute(builder: (_) => NewTicketScreen(state: widget.state)),
    );
    if (created != null && mounted) {
      await _openTicket(created.id, ticket: created);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final user = state.user;
        if (user == null) return const SizedBox.shrink();
        return Scaffold(
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_titles[_index]),
                Text(
                  _index == 0
                      ? '${state.tickets.where((t) => t.isOpen).length} tiket aktif · ${user.roleLabel}'
                      : _index == 1
                          ? '${state.unreadNotifications} belum dibaca'
                          : state.apiBase.replaceFirst(RegExp(r'^https?://'), ''),
                  style: const TextStyle(fontSize: 10.5, color: AppColors.muted, fontWeight: FontWeight.w500),
                ),
              ],
            ),
            actions: [
              if (_index == 0)
                IconButton(
                  tooltip: 'Muat ulang',
                  onPressed: state.refreshing ? null : state.refreshTickets,
                  icon: state.refreshing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh_rounded, size: 21),
                ),
              Padding(
                padding: const EdgeInsets.only(right: 14),
                child: ConnectionPill(connected: state.connected),
              ),
            ],
          ),
          body: IndexedStack(
            index: _index,
            children: [
              TicketsScreen(state: state, onOpenTicket: _openTicket),
              NotificationsScreen(state: state, onOpenTicket: _openTicket),
              SettingsScreen(state: state),
            ],
          ),
          floatingActionButton: _index == 0 && !state.isStaff
              ? FloatingActionButton.extended(
                  onPressed: _createTicket,
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Tiket baru', style: TextStyle(fontWeight: FontWeight.w700)),
                )
              : null,
          bottomNavigationBar: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (value) => setState(() => _index = value),
            destinations: [
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: state.unreadTickets > 0,
                  label: Text('${state.unreadTickets}'),
                  child: const Icon(Icons.inbox_rounded),
                ),
                selectedIcon: Badge(
                  isLabelVisible: state.unreadTickets > 0,
                  label: Text('${state.unreadTickets}'),
                  child: const Icon(Icons.inbox_rounded),
                ),
                label: 'Tiket',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: state.unreadNotifications > 0,
                  label: Text('${state.unreadNotifications}'),
                  child: const Icon(Icons.notifications_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: state.unreadNotifications > 0,
                  label: Text('${state.unreadNotifications}'),
                  child: const Icon(Icons.notifications_rounded),
                ),
                label: 'Notifikasi',
              ),
              const NavigationDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings_rounded),
                label: 'Pengaturan',
              ),
            ],
          ),
        );
      },
    );
  }
}
