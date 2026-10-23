import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class TicketsScreen extends StatefulWidget {
  final AppState state;
  final Future<void> Function(String ticketId, {Ticket? ticket}) onOpenTicket;

  const TicketsScreen({super.key, required this.state, required this.onOpenTicket});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  final _search = TextEditingController();
  String _query = '';
  String _status = 'all';
  bool _mineOnly = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Ticket> _filtered(List<Ticket> source) {
    var list = source;
    if (_status == 'new') {
      list = list.where((t) => t.status == 'new').toList();
    } else if (_status == 'open') {
      list = list.where((t) => ['assigned', 'in_progress', 'pending'].contains(t.status)).toList();
    } else if (_status == 'done') {
      list = list.where((t) => t.isClosed).toList();
    }
    if (_mineOnly && widget.state.user != null) {
      list = list.where((t) => t.assigneeId == widget.state.user!.id).toList();
    }
    if (_query.isNotEmpty) {
      final q = _query.toLowerCase();
      list = list.where((t) {
        return t.code.toLowerCase().contains(q) ||
            t.subject.toLowerCase().contains(q) ||
            t.customerName.toLowerCase().contains(q);
      }).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final all = state.tickets;
        final filtered = _filtered(all);
        final newCount = all.where((t) => t.status == 'new').length;

        return Column(
          children: [
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Column(
                children: [
                  TextField(
                    controller: _search,
                    onChanged: (value) => setState(() => _query = value.trim()),
                    decoration: InputDecoration(
                      hintText: 'Cari tiket, kode, atau pelanggan...',
                      prefixIcon: const Icon(Icons.search_rounded, size: 20, color: AppColors.soft),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 11),
                      suffixIcon: _query.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close_rounded, size: 18),
                              onPressed: () {
                                _search.clear();
                                setState(() => _query = '');
                              },
                            ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _FilterChip(
                          label: 'Semua',
                          selected: _status == 'all',
                          onTap: () => setState(() => _status = 'all'),
                        ),
                        _FilterChip(
                          label: 'Baru${newCount > 0 ? ' ($newCount)' : ''}',
                          selected: _status == 'new',
                          onTap: () => setState(() => _status = 'new'),
                        ),
                        _FilterChip(
                          label: 'Aktif',
                          selected: _status == 'open',
                          onTap: () => setState(() => _status = 'open'),
                        ),
                        _FilterChip(
                          label: 'Selesai',
                          selected: _status == 'done',
                          onTap: () => setState(() => _status = 'done'),
                        ),
                        if (state.isStaff) ...[
                          const SizedBox(width: 6),
                          Container(width: 1, height: 20, color: AppColors.line),
                          const SizedBox(width: 6),
                          _FilterChip(
                            label: 'Tiket saya',
                            selected: _mineOnly,
                            onTap: () => setState(() => _mineOnly = !_mineOnly),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (!state.connected)
              Material(
                color: const Color(0xFFFFFBEB),
                child: InkWell(
                  onTap: state.refreshTickets,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: const Row(
                      children: [
                        Icon(Icons.cloud_off_rounded, size: 15, color: Color(0xFFB45309)),
                        SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            'Koneksi terputus. Data dimuat lewat REST, pesan akan diantrekan.',
                            style: TextStyle(fontSize: 11, color: Color(0xFF92400E)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (state.pendingMessages > 0)
              Container(
                width: double.infinity,
                color: const Color(0xFFEFF6FF),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                child: Row(
                  children: [
                    const Icon(Icons.schedule_send_rounded, size: 15, color: AppColors.primary),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        '${state.pendingMessages} pesan menunggu koneksi',
                        style: const TextStyle(fontSize: 11, color: AppColors.primary),
                      ),
                    ),
                    TextButton(
                      onPressed: state.flushQueue,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 28),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('Kirim ulang', style: TextStyle(fontSize: 11)),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.primary,
                onRefresh: state.refreshTickets,
                child: filtered.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          SizedBox(height: MediaQuery.of(context).size.height * 0.16),
                          EmptyView(
                            icon: Icons.inbox_rounded,
                            title: state.tickets.isEmpty ? 'Belum ada tiket' : 'Tidak ada hasil',
                            message: state.tickets.isEmpty
                                ? (state.isStaff
                                    ? 'Tiket baru dari widget, web, atau mobile akan muncul di sini.'
                                    : 'Mulai percakapan baru dengan tim support lewat tombol Tiket baru.')
                                : 'Coba ubah filter atau kata kunci pencarian.',
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 90),
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final ticket = filtered[index];
                          return TicketCard(
                            ticket: ticket,
                            unread: state.unreadTicketIds.contains(ticket.id),
                            onTap: () => widget.onOpenTicket(ticket.id, ticket: ticket),
                          );
                        },
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? AppColors.primary : AppColors.line),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : AppColors.muted,
            ),
          ),
        ),
      ),
    );
  }
}
