import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ciheul_helpdesk/core/format.dart';
import 'package:ciheul_helpdesk/core/models.dart';
import 'package:ciheul_helpdesk/widgets/common.dart';

void main() {
  test('ticket payload from the API is parsed', () {
    final ticket = Ticket.fromJson({
      'id': 'tkt_1',
      'code': 'HD-00001',
      'subject': 'Tidak bisa login',
      'description': 'Password ditolak',
      'status': 'in_progress',
      'priority': 'high',
      'channel': 'mobile',
      'customer_id': 'usr_1',
      'customer_name': 'Budi',
      'customer_email': 'budi@example.com',
      'assignee_id': 'usr_2',
      'assignee_name': 'Sari',
      'message_count': 3,
      'reopen_count': 0,
      'sla': {
        'resolution_due_in': 5400,
        'resolution_breached': false,
      },
    });

    expect(ticket.code, 'HD-00001');
    expect(ticket.isOpen, isTrue);
    expect(ticket.isClosed, isFalse);
    expect(ticket.sla.resolutionDueIn, 5400);
    expect(ticket.assigneeName, 'Sari');
  });

  test('closed tickets are reported as closed', () {
    final ticket = Ticket.fromJson({
      'id': 'tkt_2',
      'status': 'resolved',
      'customer_id': 'usr_1',
    });

    expect(ticket.isClosed, isTrue);
    expect(ticket.isOpen, isFalse);
  });

  test('format helpers normalize labels', () {
    expect(statusLabel('in_progress'), 'Diproses');
    expect(priorityLabel('urgent'), 'Urgent');
    expect(initials('Budi Santoso'), 'BS');
    expect(normalizeBaseUrl('10.0.2.2:3000'), 'http://10.0.2.2:3000');
    expect(normalizeBaseUrl('http://localhost:3000/'), 'http://localhost:3000');
    expect(normalizeBaseUrl('   '), isNull);
  });

  testWidgets('status chip renders the localized label', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: StatusChip(status: 'in_progress')),
        ),
      ),
    );

    expect(find.text('Diproses'), findsOneWidget);
  });
}
