class ProjectModel {
  final String id;
  final String name;
  final String? description;
  final String ownerId;
  final List<String> memberIds;
  final ProjectStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final Map<String, dynamic> settings;

  const ProjectModel({
    required this.id,
    required this.name,
    this.description,
    required this.ownerId,
    this.memberIds = const [],
    this.status = ProjectStatus.active,
    required this.createdAt,
    required this.updatedAt,
    this.settings = const {},
  });

  factory ProjectModel.fromJson(Map<String, dynamic> json) {
    return ProjectModel(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      ownerId: json['ownerId'] as String,
      memberIds: (json['memberIds'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      status: ProjectStatus.fromString(json['status'] as String? ?? 'active'),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      settings: (json['settings'] as Map<String, dynamic>?) ?? {},
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'ownerId': ownerId,
      'memberIds': memberIds,
      'status': status.name,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'settings': settings,
    };
  }

  ProjectModel copyWith({
    String? id,
    String? name,
    String? description,
    String? ownerId,
    List<String>? memberIds,
    ProjectStatus? status,
    DateTime? createdAt,
    DateTime? updatedAt,
    Map<String, dynamic>? settings,
  }) {
    return ProjectModel(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      ownerId: ownerId ?? this.ownerId,
      memberIds: memberIds ?? this.memberIds,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      settings: settings ?? this.settings,
    );
  }

  int get totalMembers => memberIds.length + 1; // +1 for owner

  bool isMember(String userId) =>
      ownerId == userId || memberIds.contains(userId);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ProjectModel && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'ProjectModel(id: $id, name: $name, status: ${status.name})';
}

enum ProjectStatus {
  active,
  archived,
  suspended;

  static ProjectStatus fromString(String value) {
    return ProjectStatus.values.firstWhere(
      (status) => status.name == value,
      orElse: () => ProjectStatus.active,
    );
  }

  bool get isAccessible => this == active;
}
