class UserModel {
  final String id;
  final String? tenantId;
  final String fullName;
  final String email;
  final String? phone;
  final String role;
  final String? avatarUrl;
  final String status;
  final DateTime createdAt;

  const UserModel({
    required this.id,
    this.tenantId,
    required this.fullName,
    required this.email,
    this.phone,
    required this.role,
    this.avatarUrl,
    required this.status,
    required this.createdAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String? ?? json['userId'] as String,
      tenantId: json['tenantId'] as String?,
      fullName: json['fullName'] as String? ?? json['full_name'] as String? ?? '',
      email: json['email'] as String,
      phone: json['phone'] as String?,
      role: json['role'] as String,
      avatarUrl: json['avatarUrl'] as String? ?? json['avatar_url'] as String?,
      status: json['status'] as String? ?? 'active',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id, 'tenantId': tenantId, 'fullName': fullName,
    'email': email, 'phone': phone, 'role': role,
    'avatarUrl': avatarUrl, 'status': status,
    'createdAt': createdAt.toIso8601String(),
  };

  bool get isSuperAdmin => role == 'super_admin';
  bool get isTenantOwner => role == 'tenant_owner';
  bool get isManager => role == 'manager';
  bool get isStaff => role == 'staff';
  bool get isCustomer => role == 'customer';
}
