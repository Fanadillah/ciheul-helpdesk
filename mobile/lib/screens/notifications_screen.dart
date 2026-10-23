import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class NotificationsScreen extends StatelessWidget {
  final AppState state;
  final Future<void> Function(String ticketId, {Ticket? ticket}) onOpenTicket;

  const NotificationsScreen({super.key, required this.state, required this.onOpenTicket});

  IconData _iconFor(String type) {
    if (type.contains('message')) return Icons.chat_bubble_outline_rounded;
    if (type.contains('sla')) return Icons.timer_outlined;
    if (type.contains('csat')) return Icons.star_outline_rounded;
    if (type.contains('ticket')) return Icons.confirmation_number_outlined;
    return Icons.notifications_none_rounded;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final items = state.notificationList;
        return Column(
          children: [
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              child: Row(
                children: [
                  Text(
                    '${state.unreadNotifications} belum dibaca',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: state.unreadNotifications == 0 ? null : state.markAllNotificationsRead,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(0, 32),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Tandai semua dibaca', style: TextStyle(fontSize: 11.5)),
                  ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.primary,
                onRefresh: state.refreshNotifications,
                child: items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: const [
                          SizedBox(height: 90),
                          EmptyView(
                            icon: Icons.notifications_none_rounded,
                            title: 'Belum ada notifikasi',
                            message: 'Pemberitahuan tiket baru, balasan, dan SLA akan tampil di sini.',
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final notification = items[index];
                          final unread = !notification.isRead;
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            decoration: BoxDecoration(
                              color: unread ? Colors.white : const Color(0xFFF8FAFC),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: unread ? const Color(0xFFBFDBFE) : AppColors.line,
                              ),
                            ),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(14),
                                onTap: () async {
                                  await state.markNotificationRead(notification);
                                  final ticketId = notification.ticketId;
                                  if (ticketId != null && context.mounted) {
                                    await onOpenTicket(ticketId);
                                  }
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Container(
                                        width: 36,
                                        height: 36,
                                        decoration: BoxDecoration(
                                          color: unread
                                              ? const Color(0xFFEFF6FF)
                                              : const Color(0xFFF1F5F9),
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                        child: Icon(
                                          _iconFor(notification.type),
                                          size: 18,
                                          color: unread ? AppColors.primary : AppColors.soft,
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              notification.title,
                                              style: TextStyle(
                                                fontSize: 12.5,
                                                height: 1.4,
                                                fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                                                color: AppColors.ink,
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            Row(
                                              children: [
                                                Text(
                                                  timeAgo(notification.createdAt),
                                                  style: const TextStyle(fontSize: 10.5, color: AppColors.soft),
                                                ),
                                                if (notification.ticketId != null) ...[
                                                  const SizedBox(width: 6),
                                                  const Text('·', style: TextStyle(color: AppColors.soft)),
                                                  const SizedBox(width: 6),
                                                  const Text(
                                                    'Lihat tiket',
                                                    style: TextStyle(
                                                      fontSize: 10.5,
                                                      color: AppColors.primary,
                                                      fontWeight: FontWeight.w600,
                                                    ),
                                                  ),
                                                ],
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (unread)
                                        Container(
                                          width: 8,
                                          height: 8,
                                          margin: const EdgeInsets.only(top: 4, left: 6),
                                          decoration: const BoxDecoration(
                                            color: AppColors.primary,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
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
