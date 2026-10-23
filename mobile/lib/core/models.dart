class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final bool isGuest;

  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.isGuest = false,
  });

  bool get isStaff => ['agent', 'supervisor', 'admin'].contains(role);
  bool get canSeeReports => ['supervisor', 'admin'].contains(role);
  bool get isAdmin => role == 'admin';

  String get roleLabel => switch (role) {
        'agent' => 'Agent',
        'supervisor' => 'Supervisor',
        'admin' => 'Admin',
        _ => 'Customer',
      };

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        email: (json['email'] ?? '') as String,
        role: (json['role'] ?? 'customer') as String,
        isGuest: (json['is_guest'] ?? 0) == 1 || json['is_guest'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'is_guest': isGuest ? 1 : 0,
      };
}

class Category {
  final String id;
  final String name;
  final String? description;
  final String defaultPriority;
  final int firstResponseMin;
  final int resolutionMin;

  const Category({
    required this.id,
    required this.name,
    this.description,
    this.defaultPriority = 'medium',
    this.firstResponseMin = 30,
    this.resolutionMin = 1440,
  });

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        description: json['description'] as String?,
        defaultPriority: (json['default_priority'] ?? 'medium') as String,
        firstResponseMin: (json['first_response_min'] ?? 30) as int,
        resolutionMin: (json['resolution_min'] ?? 1440) as int,
      );
}

class SlaInfo {
  final int? firstResponseDueIn;
  final int? resolutionDueIn;
  final bool firstResponseBreached;
  final bool resolutionBreached;

  const SlaInfo({
    this.firstResponseDueIn,
    this.resolutionDueIn,
    this.firstResponseBreached = false,
    this.resolutionBreached = false,
  });

  factory SlaInfo.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const SlaInfo();
    return SlaInfo(
      firstResponseDueIn: json['first_response_due_in'] as int?,
      resolutionDueIn: json['resolution_due_in'] as int?,
      firstResponseBreached: json['first_response_breached'] == true,
      resolutionBreached: json['resolution_breached'] == true,
    );
  }
}

class Attachment {
  final String id;
  final String originalName;
  final String mime;
  final int size;

  const Attachment({
    required this.id,
    required this.originalName,
    this.mime = 'application/octet-stream',
    this.size = 0,
  });

  factory Attachment.fromJson(Map<String, dynamic> json) => Attachment(
        id: json['id'] as String,
        originalName: (json['original_name'] ?? 'lampiran') as String,
        mime: (json['mime'] ?? '') as String,
        size: (json['size'] ?? 0) as int,
      );
}

class Ticket {
  final String id;
  final String code;
  final String subject;
  final String description;
  final String status;
  final String priority;
  final String channel;
  final String? categoryId;
  final String? categoryName;
  final String customerId;
  final String customerName;
  final String customerEmail;
  final String? assigneeId;
  final String? assigneeName;
  final String? lastMessage;
  final int messageCount;
  final String? firstResponseAt;
  final String? resolvedAt;
  final String? createdAt;
  final String? updatedAt;
  final int? csatRating;
  final String? csatComment;
  final int reopenCount;
  final SlaInfo sla;

  const Ticket({
    required this.id,
    required this.code,
    required this.subject,
    required this.description,
    required this.status,
    required this.priority,
    required this.channel,
    this.categoryId,
    this.categoryName,
    required this.customerId,
    required this.customerName,
    required this.customerEmail,
    this.assigneeId,
    this.assigneeName,
    this.lastMessage,
    this.messageCount = 0,
    this.firstResponseAt,
    this.resolvedAt,
    this.createdAt,
    this.updatedAt,
    this.csatRating,
    this.csatComment,
    this.reopenCount = 0,
    this.sla = const SlaInfo(),
  });

  bool get isClosed => ['resolved', 'closed'].contains(status);
  bool get isOpen => !isClosed;

  factory Ticket.fromJson(Map<String, dynamic> json) => Ticket(
        id: json['id'] as String,
        code: (json['code'] ?? '') as String,
        subject: (json['subject'] ?? '') as String,
        description: (json['description'] ?? '') as String,
        status: (json['status'] ?? 'new') as String,
        priority: (json['priority'] ?? 'medium') as String,
        channel: (json['channel'] ?? 'web') as String,
        categoryId: json['category_id'] as String?,
        categoryName: json['category_name'] as String?,
        customerId: (json['customer_id'] ?? '') as String,
        customerName: (json['customer_name'] ?? 'Customer') as String,
        customerEmail: (json['customer_email'] ?? '') as String,
        assigneeId: json['assignee_id'] as String?,
        assigneeName: json['assignee_name'] as String?,
        lastMessage: json['last_message'] as String?,
        messageCount: (json['message_count'] ?? 0) as int,
        firstResponseAt: json['first_response_at'] as String?,
        resolvedAt: json['resolved_at'] as String?,
        createdAt: json['created_at'] as String?,
        updatedAt: json['updated_at'] as String?,
        csatRating: json['csat_rating'] as int?,
        csatComment: json['csat_comment'] as String?,
        reopenCount: (json['reopen_count'] ?? 0) as int,
        sla: SlaInfo.fromJson(json['sla'] as Map<String, dynamic>?),
      );

  Ticket copyWith({
    String? status,
    String? priority,
    String? assigneeId,
    String? assigneeName,
    String? lastMessage,
    String? updatedAt,
    int? csatRating,
    int? messageCount,
  }) =>
      Ticket(
        id: id,
        code: code,
        subject: subject,
        description: description,
        status: status ?? this.status,
        priority: priority ?? this.priority,
        channel: channel,
        categoryId: categoryId,
        categoryName: categoryName,
        customerId: customerId,
        customerName: customerName,
        customerEmail: customerEmail,
        assigneeId: assigneeId ?? this.assigneeId,
        assigneeName: assigneeName ?? this.assigneeName,
        lastMessage: lastMessage ?? this.lastMessage,
        messageCount: messageCount ?? this.messageCount,
        firstResponseAt: firstResponseAt,
        resolvedAt: resolvedAt,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        csatRating: csatRating ?? this.csatRating,
        csatComment: csatComment,
        reopenCount: reopenCount,
        sla: sla,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'subject': subject,
        'description': description,
        'status': status,
        'priority': priority,
        'channel': channel,
        'category_id': categoryId,
        'category_name': categoryName,
        'customer_id': customerId,
        'customer_name': customerName,
        'customer_email': customerEmail,
        'assignee_id': assigneeId,
        'assignee_name': assigneeName,
        'last_message': lastMessage,
        'message_count': messageCount,
        'first_response_at': firstResponseAt,
        'resolved_at': resolvedAt,
        'created_at': createdAt,
        'updated_at': updatedAt,
        'csat_rating': csatRating,
        'csat_comment': csatComment,
        'reopen_count': reopenCount,
        'sla': {
          'first_response_due_in': sla.firstResponseDueIn,
          'resolution_due_in': sla.resolutionDueIn,
          'first_response_breached': sla.firstResponseBreached,
          'resolution_breached': sla.resolutionBreached,
        },
      };
}

class Message {
  final String id;
  final String ticketId;
  final String? senderId;
  final String senderType;
  final String senderName;
  final String body;
  final bool isInternal;
  final String? clientMessageId;
  final int seq;
  final String createdAt;
  final List<Attachment> attachments;
  final bool pending;
  final bool failed;
  final bool queued;

  const Message({
    required this.id,
    required this.ticketId,
    this.senderId,
    required this.senderType,
    required this.senderName,
    required this.body,
    this.isInternal = false,
    this.clientMessageId,
    this.seq = 0,
    required this.createdAt,
    this.attachments = const [],
    this.pending = false,
    this.failed = false,
    this.queued = false,
  });

  bool get isCustomer => senderType == 'customer';
  bool get isAi => senderType == 'ai';

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: (json['id'] ?? '') as String,
        ticketId: (json['ticket_id'] ?? '') as String,
        senderId: json['sender_id'] as String?,
        senderType: (json['sender_type'] ?? 'system') as String,
        senderName: (json['sender_name'] ?? '') as String,
        body: (json['body'] ?? '') as String,
        isInternal: json['is_internal'] == true || json['is_internal'] == 1,
        clientMessageId: json['client_message_id'] as String?,
        seq: (json['seq'] ?? 0) as int,
        createdAt: (json['created_at'] ?? DateTime.now().toIso8601String()) as String,
        attachments: ((json['attachments'] as List?) ?? const [])
            .map((a) => Attachment.fromJson(Map<String, dynamic>.from(a as Map)))
            .toList(),
      );

  Message copyWith({bool? pending, bool? failed, bool? queued, int? seq, String? id}) => Message(
        id: id ?? this.id,
        ticketId: ticketId,
        senderId: senderId,
        senderType: senderType,
        senderName: senderName,
        body: body,
        isInternal: isInternal,
        clientMessageId: clientMessageId,
        seq: seq ?? this.seq,
        createdAt: createdAt,
        attachments: attachments,
        pending: pending ?? this.pending,
        failed: failed ?? this.failed,
        queued: queued ?? this.queued,
      );
}

class AppNotification {
  final String id;
  final String type;
  final String title;
  final String? ticketId;
  final String? readAt;
  final String createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    this.ticketId,
    this.readAt,
    required this.createdAt,
  });

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final payload = json['payload'];
    return AppNotification(
      id: json['id'] as String,
      type: (json['type'] ?? '') as String,
      title: (json['title'] ?? '') as String,
      ticketId: payload is Map ? payload['ticket_id'] as String? : null,
      readAt: json['read_at'] as String?,
      createdAt: (json['created_at'] ?? DateTime.now().toIso8601String()) as String,
    );
  }
}

class CannedResponse {
  final String id;
  final String title;
  final String body;

  const CannedResponse({required this.id, required this.title, required this.body});

  factory CannedResponse.fromJson(Map<String, dynamic> json) => CannedResponse(
        id: json['id'] as String,
        title: (json['title'] ?? '') as String,
        body: (json['body'] ?? '') as String,
      );
}

class UserSummary {
  final String id;
  final String name;
  final String role;

  const UserSummary({required this.id, required this.name, required this.role});

  factory UserSummary.fromJson(Map<String, dynamic> json) => UserSummary(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        role: (json['role'] ?? 'agent') as String,
      );
}

class SendOutcome {
  final Message? message;
  final bool queued;
  final String? error;

  const SendOutcome({this.message, this.queued = false, this.error});
}
