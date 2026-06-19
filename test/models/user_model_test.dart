import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/models/user_model.dart';

void main() {
  group('UserModel', () {
    final now = DateTime(2024, 1, 15, 10, 30);

    UserModel createUser({
      String id = 'user_1',
      String email = 'test@example.com',
      String displayName = 'Test User',
      String? avatarUrl,
      UserRole role = UserRole.member,
      DateTime? createdAt,
      DateTime? lastLoginAt,
      SubscriptionTier subscriptionTier = SubscriptionTier.free,
    }) {
      return UserModel(
        id: id,
        email: email,
        displayName: displayName,
        avatarUrl: avatarUrl,
        role: role,
        createdAt: createdAt ?? now,
        lastLoginAt: lastLoginAt,
        subscriptionTier: subscriptionTier,
      );
    }

    test('constructs with required fields', () {
      final user = createUser();
      expect(user.id, 'user_1');
      expect(user.email, 'test@example.com');
      expect(user.displayName, 'Test User');
      expect(user.avatarUrl, isNull);
      expect(user.role, UserRole.member);
      expect(user.subscriptionTier, SubscriptionTier.free);
    });

    test('fromJson creates correct model', () {
      final json = {
        'id': 'user_1',
        'email': 'test@example.com',
        'displayName': 'Test User',
        'avatarUrl': 'https://example.com/avatar.png',
        'role': 'admin',
        'createdAt': '2024-01-15T10:30:00.000',
        'lastLoginAt': '2024-01-16T08:00:00.000',
        'subscriptionTier': 'professional',
      };

      final user = UserModel.fromJson(json);
      expect(user.id, 'user_1');
      expect(user.email, 'test@example.com');
      expect(user.avatarUrl, 'https://example.com/avatar.png');
      expect(user.role, UserRole.admin);
      expect(user.subscriptionTier, SubscriptionTier.professional);
      expect(user.lastLoginAt, isNotNull);
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'user_1',
        'email': 'test@example.com',
        'displayName': 'Test User',
        'createdAt': '2024-01-15T10:30:00.000',
      };

      final user = UserModel.fromJson(json);
      expect(user.avatarUrl, isNull);
      expect(user.role, UserRole.member);
      expect(user.lastLoginAt, isNull);
      expect(user.subscriptionTier, SubscriptionTier.free);
    });

    test('toJson produces correct map', () {
      final user = createUser(
        avatarUrl: 'https://example.com/avatar.png',
        role: UserRole.admin,
        lastLoginAt: DateTime(2024, 1, 16),
        subscriptionTier: SubscriptionTier.enterprise,
      );

      final json = user.toJson();
      expect(json['id'], 'user_1');
      expect(json['email'], 'test@example.com');
      expect(json['avatarUrl'], 'https://example.com/avatar.png');
      expect(json['role'], 'admin');
      expect(json['subscriptionTier'], 'enterprise');
      expect(json['lastLoginAt'], isNotNull);
    });

    test('toJson round-trips through fromJson', () {
      final user = createUser(
        avatarUrl: 'https://example.com/avatar.png',
        role: UserRole.owner,
        lastLoginAt: DateTime(2024, 1, 16),
        subscriptionTier: SubscriptionTier.starter,
      );

      final roundTripped = UserModel.fromJson(user.toJson());
      expect(roundTripped, equals(user));
    });

    test('copyWith creates modified copy', () {
      final user = createUser();
      final modified = user.copyWith(
        email: 'new@example.com',
        role: UserRole.admin,
      );

      expect(modified.email, 'new@example.com');
      expect(modified.role, UserRole.admin);
      expect(modified.id, user.id);
      expect(modified.displayName, user.displayName);
    });

    test('copyWith overrides all fields', () {
      final user = createUser();
      final modified = user.copyWith(
        id: 'new_id',
        email: 'new@test.com',
        displayName: 'New Name',
        avatarUrl: 'https://new.com/avatar.png',
        role: UserRole.owner,
        createdAt: DateTime(2025, 1, 1),
        lastLoginAt: DateTime(2025, 1, 2),
        subscriptionTier: SubscriptionTier.enterprise,
      );

      expect(modified.id, 'new_id');
      expect(modified.avatarUrl, 'https://new.com/avatar.png');
      expect(modified.role, UserRole.owner);
      expect(modified.subscriptionTier, SubscriptionTier.enterprise);
    });

    test('copyWith preserves fields when not overridden', () {
      final user = createUser(
        avatarUrl: 'https://example.com/old.png',
        role: UserRole.admin,
      );
      final modified = user.copyWith(displayName: 'Changed');

      expect(modified.displayName, 'Changed');
      expect(modified.email, user.email);
      expect(modified.avatarUrl, user.avatarUrl);
      expect(modified.role, user.role);
    });

    test('equality works correctly', () {
      final user1 = createUser();
      final user2 = createUser();
      final user3 = createUser(id: 'user_2');

      expect(user1, equals(user2));
      expect(user1, isNot(equals(user3)));
    });

    test('hashCode is consistent with equality', () {
      final user1 = createUser();
      final user2 = createUser();
      expect(user1.hashCode, equals(user2.hashCode));
    });

    test('toString contains key fields', () {
      final user = createUser();
      final str = user.toString();
      expect(str, contains('user_1'));
      expect(str, contains('test@example.com'));
      expect(str, contains('Test User'));
    });
  });

  group('UserRole', () {
    test('fromString parses valid roles', () {
      expect(UserRole.fromString('admin'), UserRole.admin);
      expect(UserRole.fromString('owner'), UserRole.owner);
      expect(UserRole.fromString('member'), UserRole.member);
      expect(UserRole.fromString('viewer'), UserRole.viewer);
    });

    test('fromString defaults to member for unknown values', () {
      expect(UserRole.fromString('unknown'), UserRole.member);
      expect(UserRole.fromString(''), UserRole.member);
    });

    test('canManageUsers is correct', () {
      expect(UserRole.admin.canManageUsers, isTrue);
      expect(UserRole.owner.canManageUsers, isTrue);
      expect(UserRole.member.canManageUsers, isFalse);
      expect(UserRole.viewer.canManageUsers, isFalse);
    });

    test('canEditContent is correct', () {
      expect(UserRole.admin.canEditContent, isTrue);
      expect(UserRole.owner.canEditContent, isTrue);
      expect(UserRole.member.canEditContent, isTrue);
      expect(UserRole.viewer.canEditContent, isFalse);
    });
  });

  group('SubscriptionTier', () {
    test('fromString parses valid tiers', () {
      expect(SubscriptionTier.fromString('free'), SubscriptionTier.free);
      expect(SubscriptionTier.fromString('starter'), SubscriptionTier.starter);
      expect(SubscriptionTier.fromString('professional'), SubscriptionTier.professional);
      expect(SubscriptionTier.fromString('enterprise'), SubscriptionTier.enterprise);
    });

    test('fromString defaults to free for unknown', () {
      expect(SubscriptionTier.fromString('unknown'), SubscriptionTier.free);
    });

    test('maxProjects returns correct limits', () {
      expect(SubscriptionTier.free.maxProjects, 3);
      expect(SubscriptionTier.starter.maxProjects, 10);
      expect(SubscriptionTier.professional.maxProjects, 50);
      expect(SubscriptionTier.enterprise.maxProjects, -1);
    });

    test('maxTeamMembers returns correct limits', () {
      expect(SubscriptionTier.free.maxTeamMembers, 2);
      expect(SubscriptionTier.starter.maxTeamMembers, 5);
      expect(SubscriptionTier.professional.maxTeamMembers, 25);
      expect(SubscriptionTier.enterprise.maxTeamMembers, -1);
    });

    test('monthlyPrice returns correct prices', () {
      expect(SubscriptionTier.free.monthlyPrice, 0);
      expect(SubscriptionTier.starter.monthlyPrice, 9.99);
      expect(SubscriptionTier.professional.monthlyPrice, 29.99);
      expect(SubscriptionTier.enterprise.monthlyPrice, 99.99);
    });
  });
}
