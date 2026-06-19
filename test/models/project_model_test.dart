import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/models/project_model.dart';

void main() {
  group('ProjectModel', () {
    final now = DateTime(2024, 1, 15, 10, 30);

    ProjectModel createProject({
      String id = 'proj_1',
      String name = 'Test Project',
      String? description,
      String ownerId = 'user_1',
      List<String> memberIds = const [],
      ProjectStatus status = ProjectStatus.active,
    }) {
      return ProjectModel(
        id: id,
        name: name,
        description: description,
        ownerId: ownerId,
        memberIds: memberIds,
        status: status,
        createdAt: now,
        updatedAt: now,
      );
    }

    test('constructs with required fields', () {
      final project = createProject();
      expect(project.id, 'proj_1');
      expect(project.name, 'Test Project');
      expect(project.ownerId, 'user_1');
      expect(project.status, ProjectStatus.active);
      expect(project.memberIds, isEmpty);
      expect(project.settings, isEmpty);
    });

    test('fromJson creates correct model', () {
      final json = {
        'id': 'proj_1',
        'name': 'Test Project',
        'description': 'A test project',
        'ownerId': 'user_1',
        'memberIds': ['user_2', 'user_3'],
        'status': 'archived',
        'createdAt': '2024-01-15T10:30:00.000',
        'updatedAt': '2024-01-15T10:30:00.000',
        'settings': {'color': 'blue'},
      };

      final project = ProjectModel.fromJson(json);
      expect(project.name, 'Test Project');
      expect(project.description, 'A test project');
      expect(project.memberIds, ['user_2', 'user_3']);
      expect(project.status, ProjectStatus.archived);
      expect(project.settings, {'color': 'blue'});
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'proj_1',
        'name': 'Test',
        'ownerId': 'user_1',
        'createdAt': '2024-01-15T10:30:00.000',
        'updatedAt': '2024-01-15T10:30:00.000',
      };

      final project = ProjectModel.fromJson(json);
      expect(project.description, isNull);
      expect(project.memberIds, isEmpty);
      expect(project.status, ProjectStatus.active);
      expect(project.settings, isEmpty);
    });

    test('toJson produces correct map', () {
      final project = createProject(
        description: 'Desc',
        memberIds: ['user_2'],
      );

      final json = project.toJson();
      expect(json['id'], 'proj_1');
      expect(json['name'], 'Test Project');
      expect(json['description'], 'Desc');
      expect(json['memberIds'], ['user_2']);
      expect(json['status'], 'active');
    });

    test('toJson round-trips through fromJson', () {
      final project = createProject(
        description: 'A project',
        memberIds: ['user_2'],
      );

      final roundTripped = ProjectModel.fromJson(project.toJson());
      expect(roundTripped.id, project.id);
      expect(roundTripped.name, project.name);
      expect(roundTripped.description, project.description);
    });

    test('copyWith creates modified copy', () {
      final project = createProject();
      final modified = project.copyWith(
        name: 'New Name',
        status: ProjectStatus.archived,
      );

      expect(modified.name, 'New Name');
      expect(modified.status, ProjectStatus.archived);
      expect(modified.id, project.id);
      expect(modified.ownerId, project.ownerId);
    });

    test('totalMembers includes owner', () {
      final project = createProject(memberIds: ['user_2', 'user_3']);
      expect(project.totalMembers, 3);
    });

    test('totalMembers is 1 with no members', () {
      final project = createProject();
      expect(project.totalMembers, 1);
    });

    test('isMember returns true for owner', () {
      final project = createProject();
      expect(project.isMember('user_1'), isTrue);
    });

    test('isMember returns true for members', () {
      final project = createProject(memberIds: ['user_2']);
      expect(project.isMember('user_2'), isTrue);
    });

    test('isMember returns false for non-members', () {
      final project = createProject();
      expect(project.isMember('user_99'), isFalse);
    });

    test('equality is based on id', () {
      final p1 = createProject(id: 'proj_1', name: 'A');
      final p2 = createProject(id: 'proj_1', name: 'B');
      final p3 = createProject(id: 'proj_2', name: 'A');

      expect(p1, equals(p2));
      expect(p1, isNot(equals(p3)));
    });

    test('hashCode is based on id', () {
      final p1 = createProject(id: 'proj_1', name: 'A');
      final p2 = createProject(id: 'proj_1', name: 'B');
      expect(p1.hashCode, equals(p2.hashCode));
    });

    test('toString contains key fields', () {
      final project = createProject();
      final str = project.toString();
      expect(str, contains('proj_1'));
      expect(str, contains('Test Project'));
    });
  });

  group('ProjectStatus', () {
    test('fromString parses valid statuses', () {
      expect(ProjectStatus.fromString('active'), ProjectStatus.active);
      expect(ProjectStatus.fromString('archived'), ProjectStatus.archived);
      expect(ProjectStatus.fromString('suspended'), ProjectStatus.suspended);
    });

    test('fromString defaults to active for unknown', () {
      expect(ProjectStatus.fromString('unknown'), ProjectStatus.active);
    });

    test('isAccessible is correct', () {
      expect(ProjectStatus.active.isAccessible, isTrue);
      expect(ProjectStatus.archived.isAccessible, isFalse);
      expect(ProjectStatus.suspended.isAccessible, isFalse);
    });
  });
}
