class UserModel {
  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final UserRole role;
  final DateTime createdAt;
  final DateTime? lastLoginAt;
  final SubscriptionTier subscriptionTier;

  const UserModel({
    required this.id,
    required this.email,
    required this.displayName,
    this.avatarUrl,
    this.role = UserRole.member,
    required this.createdAt,
    this.lastLoginAt,
    this.subscriptionTier = SubscriptionTier.free,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      role: UserRole.fromString(json['role'] as String? ?? 'member'),
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastLoginAt: json['lastLoginAt'] != null
          ? DateTime.parse(json['lastLoginAt'] as String)
          : null,
      subscriptionTier: SubscriptionTier.fromString(
        json['subscriptionTier'] as String? ?? 'free',
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'displayName': displayName,
      'avatarUrl': avatarUrl,
      'role': role.name,
      'createdAt': createdAt.toIso8601String(),
      'lastLoginAt': lastLoginAt?.toIso8601String(),
      'subscriptionTier': subscriptionTier.name,
    };
  }

  UserModel copyWith({
    String? id,
    String? email,
    String? displayName,
    String? avatarUrl,
    UserRole? role,
    DateTime? createdAt,
    DateTime? lastLoginAt,
    SubscriptionTier? subscriptionTier,
  }) {
    return UserModel(
      id: id ?? this.id,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
      lastLoginAt: lastLoginAt ?? this.lastLoginAt,
      subscriptionTier: subscriptionTier ?? this.subscriptionTier,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UserModel &&
        other.id == id &&
        other.email == email &&
        other.displayName == displayName &&
        other.avatarUrl == avatarUrl &&
        other.role == role &&
        other.createdAt == createdAt &&
        other.lastLoginAt == lastLoginAt &&
        other.subscriptionTier == subscriptionTier;
  }

  @override
  int get hashCode {
    return Object.hash(
      id,
      email,
      displayName,
      avatarUrl,
      role,
      createdAt,
      lastLoginAt,
      subscriptionTier,
    );
  }

  @override
  String toString() {
    return 'UserModel(id: $id, email: $email, displayName: $displayName, '
        'role: ${role.name}, tier: ${subscriptionTier.name})';
  }
}

enum UserRole {
  admin,
  owner,
  member,
  viewer;

  static UserRole fromString(String value) {
    return UserRole.values.firstWhere(
      (role) => role.name == value,
      orElse: () => UserRole.member,
    );
  }

  bool get canManageUsers => this == admin || this == owner;
  bool get canEditContent => this != viewer;
}

enum SubscriptionTier {
  free,
  starter,
  professional,
  enterprise;

  static SubscriptionTier fromString(String value) {
    return SubscriptionTier.values.firstWhere(
      (tier) => tier.name == value,
      orElse: () => SubscriptionTier.free,
    );
  }

  int get maxProjects {
    switch (this) {
      case SubscriptionTier.free:
        return 3;
      case SubscriptionTier.starter:
        return 10;
      case SubscriptionTier.professional:
        return 50;
      case SubscriptionTier.enterprise:
        return -1; // unlimited
    }
  }

  int get maxTeamMembers {
    switch (this) {
      case SubscriptionTier.free:
        return 2;
      case SubscriptionTier.starter:
        return 5;
      case SubscriptionTier.professional:
        return 25;
      case SubscriptionTier.enterprise:
        return -1; // unlimited
    }
  }

  double get monthlyPrice {
    switch (this) {
      case SubscriptionTier.free:
        return 0;
      case SubscriptionTier.starter:
        return 9.99;
      case SubscriptionTier.professional:
        return 29.99;
      case SubscriptionTier.enterprise:
        return 99.99;
    }
  }
}
