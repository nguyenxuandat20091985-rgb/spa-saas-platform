class CustomerModel {
  final String id;
  final String tenantId;
  final String fullName;
  final String phone;
  final String? email;
  final String? gender;
  final DateTime? dateOfBirth;
  final String? skinType;
  final List<String>? skinConcerns;
  final String? membershipTier;
  final int loyaltyPoints;
  final double totalSpent;
  final int visitCount;
  final DateTime? lastVisitAt;
  final String? acquisitionSource;
  final List<String>? tags;
  final String status;
  final DateTime createdAt;

  const CustomerModel({
    required this.id,
    required this.tenantId,
    required this.fullName,
    required this.phone,
    this.email,
    this.gender,
    this.dateOfBirth,
    this.skinType,
    this.skinConcerns,
    this.membershipTier,
    this.loyaltyPoints = 0,
    this.totalSpent = 0,
    this.visitCount = 0,
    this.lastVisitAt,
    this.acquisitionSource,
    this.tags,
    this.status = 'active',
    required this.createdAt,
  });

  factory CustomerModel.fromJson(Map<String, dynamic> json) {
    return CustomerModel(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String? ?? json['tenant_id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? json['full_name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      email: json['email'] as String?,
      gender: json['gender'] as String?,
      dateOfBirth: json['dateOfBirth'] != null ? DateTime.tryParse(json['dateOfBirth'] as String) : null,
      skinType: json['skinType'] as String? ?? json['skin_type'] as String?,
      skinConcerns: (json['skinConcerns'] as List?)?.cast<String>() ?? (json['skin_concerns'] as List?)?.cast<String>(),
      membershipTier: json['membershipTier'] as String? ?? json['membership_tier'] as String?,
      loyaltyPoints: (json['loyaltyPoints'] ?? json['loyalty_points'] ?? 0) as int,
      totalSpent: ((json['totalSpent'] ?? json['total_spent'] ?? 0) as num).toDouble(),
      visitCount: (json['visitCount'] ?? json['visit_count'] ?? 0) as int,
      lastVisitAt: json['lastVisitAt'] != null ? DateTime.tryParse(json['lastVisitAt'] as String) : null,
      acquisitionSource: json['acquisitionSource'] as String? ?? json['acquisition_source'] as String?,
      tags: (json['tags'] as List?)?.cast<String>(),
      status: json['status'] as String? ?? 'active',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
    );
  }

  String get membershipDisplay {
    switch (membershipTier?.toLowerCase()) {
      case 'diamond': return 'Diamond';
      case 'platinum': return 'Platinum';
      case 'gold': return 'Gold';
      case 'silver': return 'Silver';
      default: return 'Member';
    }
  }

  bool get isVip => ['diamond', 'platinum', 'gold'].contains(membershipTier?.toLowerCase());
}
