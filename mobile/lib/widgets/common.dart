import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';

class StatusChip extends StatelessWidget {
  final String status;
  const StatusChip({super.key, required this.status});

  static const _colors = {
    'new': (Color(0xFFEFF6FF), Color(0xFF1D4ED8)),
    'assigned': (Color(0xFFEEF2FF), Color(0xFF4338CA)),
    'in_progress': (Color(0xFFFFFBEB), Color(0xFFB45309)),
    'pending': (Color(0xFFFDF4FF), Color(0xFFA21CAF)),
    'resolved': (Color(0xFFECFDF5), Color(0xFF15803D)),
    'closed': (Color(0xFFF1F5F9), Color(0xFF64748B)),
  };

  @override
  Widget build(BuildContext context) {
    final pair = _colors[status] ?? _colors['closed']!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: pair.$1, borderRadius: BorderRadius.circular(6)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(color: pair.$2, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Text(
            statusLabel(status),
            style: TextStyle(color: pair.$2, fontSize: 10.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class PriorityChip extends StatelessWidget {
  final String priority;
  const PriorityChip({super.key, required this.priority});

  static const _colors = {
    'urgent': (Color(0xFFFEF2F2), Color(0xFFDC2626)),
    'high': (Color(0xFFFFF7ED), Color(0xFFC2410C)),
    'medium': (Color(0xFFEFF6FF), Color(0xFF1D4ED8)),
    'low': (Color(0xFFF1F5F9), Color(0xFF64748B)),
  };

  @override
  Widget build(BuildContext context) {
    final pair = _colors[priority] ?? _colors['low']!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: pair.$1, borderRadius: BorderRadius.circular(5)),
      child: Text(
        priorityLabel(priority),
        style: TextStyle(color: pair.$2, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.2),
      ),
    );
  }
}

class UserAvatar extends StatelessWidget {
  final String name;
  final double size;
  final bool customer;
  final bool ai;

  const UserAvatar({
    super.key,
    required this.name,
    this.size = 38,
    this.customer = false,
    this.ai = false,
  });

  @override
  Widget build(BuildContext context) {
    final gradient = ai
        ? const [Color(0xFF8B5CF6), Color(0xFF6D28D9)]
        : customer
            ? const [Color(0xFFF59E0B), Color(0xFFEA580C)]
            : const [Color(0xFF3B82F6), Color(0xFF7C3AED)];
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      alignment: Alignment.center,
      child: Text(
        initials(name),
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.34,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class ConnectionPill extends StatelessWidget {
  final bool connected;
  final bool compact;

  const ConnectionPill({super.key, required this.connected, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final color = connected ? AppColors.success : AppColors.warning;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 4 : 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          if (!compact) ...[
            const SizedBox(width: 6),
            Text(
              connected ? 'Realtime' : 'Offline',
              style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ],
        ],
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  const EmptyView({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: AppColors.line),
              ),
              child: Icon(icon, color: AppColors.soft, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.55),
            ),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

class TicketCard extends StatelessWidget {
  final Ticket ticket;
  final bool unread;
  final VoidCallback onTap;

  const TicketCard({
    super.key,
    required this.ticket,
    this.unread = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final sla = ticket.sla;
    final late = sla.firstResponseBreached || sla.resolutionBreached;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: unread ? const Color(0xFFBFDBFE) : AppColors.line),
        boxShadow: const [BoxShadow(color: Color(0x0A0F172A), blurRadius: 10, offset: Offset(0, 4))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(15),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 3,
                  height: 62,
                  margin: const EdgeInsets.only(right: 11, top: 2),
                  decoration: BoxDecoration(
                    color: switch (ticket.priority) {
                      'urgent' => AppColors.danger,
                      'high' => AppColors.warning,
                      'medium' => AppColors.primary,
                      _ => AppColors.soft,
                    },
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              ticket.customerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink,
                              ),
                            ),
                          ),
                          if (unread)
                            Container(
                              width: 7,
                              height: 7,
                              margin: const EdgeInsets.only(right: 6),
                              decoration: const BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                          Text(
                            timeAgo(ticket.updatedAt ?? ticket.createdAt),
                            style: const TextStyle(fontSize: 10.5, color: AppColors.soft),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        ticket.subject,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF334155),
                          height: 1.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        ticket.lastMessage == null || ticket.lastMessage!.isEmpty
                            ? ticket.description
                            : ticket.lastMessage!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: AppColors.muted),
                      ),
                      const SizedBox(height: 9),
                      Row(
                        children: [
                          StatusChip(status: ticket.status),
                          if (ticket.priority == 'high' || ticket.priority == 'urgent') ...[
                            const SizedBox(width: 5),
                            PriorityChip(priority: ticket.priority),
                          ],
                          if (late) ...[
                            const SizedBox(width: 5),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF2F2),
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: const Text(
                                'SLA',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.danger,
                                ),
                              ),
                            ),
                          ],
                          const Spacer(),
                          if (ticket.assigneeName != null && ticket.assigneeName!.isNotEmpty)
                            Text(
                              ticket.assigneeName!,
                              style: const TextStyle(fontSize: 10.5, color: AppColors.soft),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
