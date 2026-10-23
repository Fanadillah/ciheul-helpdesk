import 'dart:math' as math;

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

String two(int value) => value.toString().padLeft(2, '0');

DateTime? _parse(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  return DateTime.tryParse(iso)?.toLocal();
}

String timeAgo(String? iso) {
  final date = _parse(iso);
  if (date == null) return '';
  final diff = DateTime.now().difference(date);
  if (diff.inSeconds < 60) return 'baru saja';
  if (diff.inMinutes < 60) return '${diff.inMinutes} mnt';
  if (diff.inHours < 24) return '${diff.inHours} jam';
  if (diff.inDays < 7) return '${diff.inDays} hr';
  return '${date.day} ${_months[date.month - 1]}';
}

String formatDateTime(String? iso) {
  final date = _parse(iso);
  if (date == null) return '-';
  return '${date.day} ${_months[date.month - 1]} ${date.year}, ${two(date.hour)}:${two(date.minute)}';
}

String formatClock(String? iso) {
  final date = _parse(iso);
  if (date == null) return '';
  return '${two(date.hour)}:${two(date.minute)}';
}

String dayLabel(String? iso) {
  final date = _parse(iso);
  if (date == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final target = DateTime(date.year, date.month, date.day);
  final delta = today.difference(target).inDays;
  if (delta == 0) return 'Hari ini';
  if (delta == 1) return 'Kemarin';
  return '${date.day} ${_months[date.month - 1]} ${date.year}';
}

String durationLabel(int? seconds) {
  if (seconds == null) return '-';
  final abs = seconds.abs();
  final hours = abs ~/ 3600;
  final minutes = (abs % 3600) ~/ 60;
  if (hours >= 24) return '${hours ~/ 24} hr ${hours % 24} j';
  if (hours > 0) return '$hours j $minutes mnt';
  return '$minutes mnt';
}

String statusLabel(String status) => switch (status) {
      'new' => 'Baru',
      'assigned' => 'Ditugaskan',
      'in_progress' => 'Diproses',
      'pending' => 'Pending',
      'resolved' => 'Selesai',
      'closed' => 'Ditutup',
      _ => status,
    };

String priorityLabel(String priority) => switch (priority) {
      'low' => 'Low',
      'medium' => 'Medium',
      'high' => 'High',
      'urgent' => 'Urgent',
      _ => priority,
    };

String initials(String? name) {
  final parts = (name ?? '?').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return parts.take(2).map((p) => p[0].toUpperCase()).join();
}

String truncate(String value, int max) {
  final clean = value.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (clean.length <= max) return clean;
  return '${clean.substring(0, math.max(0, max - 1))}…';
}

String? normalizeBaseUrl(String value) {
  var base = value.trim();
  if (base.isEmpty) return null;
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'http://$base';
  }
  while (base.endsWith('/')) {
    base = base.substring(0, base.length - 1);
  }
  final uri = Uri.tryParse(base);
  if (uri == null || uri.host.isEmpty) return null;
  return base;
}
