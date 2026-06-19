import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/models/user_model.dart';
import 'package:spa_saas_platform/services/project_service.dart';

void main() {
  late ProjectService projectService;

  setUp(() {
    projectService = ProjectService();
  });

  group('ProjectService - createProject', () {
    test('creates project successfully', () {
      final project = projectService.createProject(
        name: 'My Project',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(project.name, 'My Project');
      expect(project.ownerId, 'user_1');
      expect(project.id, startsWith('proj_'));
    });

    test('creates project with description', () {
      final project = projectService.createProject(
        name: 'My Project',
        description: 'A description',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(project.description, 'A description');
    });

    test('trims project name', () {
      final project = projectService.createProject(
        name: '  Trimmed  ',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );
      expect(project.name, 'Trimmed');
    });

    test('throws on empty name', () {
      expect(
        () => projectService.createProject(
          name: '',
          ownerId: 'user_1',
          ownerTier: SubscriptionTier.free,
        ),
        throwsA(isA<InvalidProjectException>()),
      );
    });

    test('throws on name exceeding 100 characters', () {
      expect(
        () => projectService.createProject(
          name: 'A' * 101,
          ownerId: 'user_1',
          ownerTier: SubscriptionTier.free,
        ),
        throwsA(isA<InvalidProjectException>()),
      );
    });

    test('enforces project limit for free tier', () {
      for (var i = 0; i < 3; i++) {
        projectService.createProject(
          name: 'Project $i',
          ownerId: 'user_1',
          ownerTier: SubscriptionTier.free,
        );
      }

      expect(
        () => projectService.createProject(
          name: 'One More',
          ownerId: 'user_1',
          ownerTier: SubscriptionTier.free,
        ),
        throwsA(isA<ProjectLimitExceededException>()),
      );
    });

    test('enterprise tier has no project limit', () {
      for (var i = 0; i < 5; i++) {
        projectService.createProject(
          name: 'Project $i',
          ownerId: 'user_1',
          ownerTier: SubscriptionTier.enterprise,
        );
      }
      expect(projectService.allProjects, hasLength(5));
    });
  });

  group('ProjectService - getProject', () {
    test('returns project by id', () {
      final created = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );
      final found = projectService.getProject(created.id);
      expect(found, isNotNull);
      expect(found!.name, 'Test');
    });

    test('returns null for unknown id', () {
      expect(projectService.getProject('unknown'), isNull);
    });
  });

  group('ProjectService - getProjectsForUser', () {
    test('returns projects where user is owner', () {
      projectService.createProject(
        name: 'P1',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );
      projectService.createProject(
        name: 'P2',
        ownerId: 'user_2',
        ownerTier: SubscriptionTier.free,
      );

      final projects = projectService.getProjectsForUser('user_1');
      expect(projects, hasLength(1));
      expect(projects.first.name, 'P1');
    });

    test('returns projects where user is member', () {
      final project = projectService.createProject(
        name: 'P1',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );
      projectService.addMember(
        project.id,
        'user_2',
        SubscriptionTier.free,
      );

      final projects = projectService.getProjectsForUser('user_2');
      expect(projects, hasLength(1));
    });
  });

  group('ProjectService - getActiveProjects', () {
    test('returns only active projects', () {
      final p1 = projectService.createProject(
        name: 'Active',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );
      projectService.createProject(
        name: 'Active2',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );
      projectService.archiveProject(p1.id);

      final active = projectService.getActiveProjects();
      expect(active, hasLength(1));
      expect(active.first.name, 'Active2');
    });
  });

  group('ProjectService - updateProject', () {
    test('updates project name', () {
      final project = projectService.createProject(
        name: 'Old Name',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      final updated = projectService.updateProject(project.id, name: 'New Name');
      expect(updated.name, 'New Name');
    });

    test('updates project description', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      final updated = projectService.updateProject(
        project.id,
        description: 'New desc',
      );
      expect(updated.description, 'New desc');
    });

    test('throws on empty name', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(
        () => projectService.updateProject(project.id, name: ''),
        throwsA(isA<InvalidProjectException>()),
      );
    });

    test('throws for unknown project', () {
      expect(
        () => projectService.updateProject('unknown', name: 'New'),
        throwsA(isA<ProjectNotFoundException>()),
      );
    });
  });

  group('ProjectService - addMember', () {
    test('adds member successfully', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.professional,
      );

      final updated = projectService.addMember(
        project.id,
        'user_2',
        SubscriptionTier.professional,
      );
      expect(updated.memberIds, contains('user_2'));
      expect(updated.totalMembers, 2);
    });

    test('throws if user already a member', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.professional,
      );
      projectService.addMember(project.id, 'user_2', SubscriptionTier.professional);

      expect(
        () => projectService.addMember(
          project.id,
          'user_2',
          SubscriptionTier.professional,
        ),
        throwsA(isA<InvalidProjectException>()),
      );
    });

    test('enforces team member limit', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      projectService.addMember(project.id, 'user_2', SubscriptionTier.free);

      expect(
        () => projectService.addMember(
          project.id,
          'user_3',
          SubscriptionTier.free,
        ),
        throwsA(isA<ProjectLimitExceededException>()),
      );
    });
  });

  group('ProjectService - removeMember', () {
    test('removes member successfully', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.professional,
      );
      projectService.addMember(project.id, 'user_2', SubscriptionTier.professional);

      final updated = projectService.removeMember(project.id, 'user_2');
      expect(updated.memberIds, isNot(contains('user_2')));
    });

    test('throws when removing owner', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(
        () => projectService.removeMember(project.id, 'user_1'),
        throwsA(isA<InvalidProjectException>()),
      );
    });

    test('throws when removing non-member', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(
        () => projectService.removeMember(project.id, 'user_99'),
        throwsA(isA<InvalidProjectException>()),
      );
    });
  });

  group('ProjectService - archiveProject', () {
    test('archives project', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      final archived = projectService.archiveProject(project.id);
      expect(archived.status.isAccessible, isFalse);
    });

    test('throws for unknown project', () {
      expect(
        () => projectService.archiveProject('unknown'),
        throwsA(isA<ProjectNotFoundException>()),
      );
    });
  });

  group('ProjectService - deleteProject', () {
    test('deletes existing project', () {
      final project = projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(projectService.deleteProject(project.id), isTrue);
      expect(projectService.getProject(project.id), isNull);
    });

    test('returns false for unknown project', () {
      expect(projectService.deleteProject('unknown'), isFalse);
    });
  });

  group('ProjectService - searchProjects', () {
    test('searches by name', () {
      projectService.createProject(
        name: 'Alpha Project',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.professional,
      );
      projectService.createProject(
        name: 'Beta Project',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.professional,
      );

      final results = projectService.searchProjects('alpha');
      expect(results, hasLength(1));
      expect(results.first.name, 'Alpha Project');
    });

    test('searches by description', () {
      projectService.createProject(
        name: 'Test',
        description: 'A flutter project',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.professional,
      );

      final results = projectService.searchProjects('flutter');
      expect(results, hasLength(1));
    });

    test('returns empty for no matches', () {
      projectService.createProject(
        name: 'Test',
        ownerId: 'user_1',
        ownerTier: SubscriptionTier.free,
      );

      expect(projectService.searchProjects('nonexistent'), isEmpty);
    });
  });

  group('ProjectNotFoundException', () {
    test('toString returns message', () {
      final exception = ProjectNotFoundException('not found');
      expect(exception.toString(), 'not found');
      expect(exception.message, 'not found');
    });
  });

  group('InvalidProjectException', () {
    test('toString returns message', () {
      final exception = InvalidProjectException('invalid');
      expect(exception.toString(), 'invalid');
      expect(exception.message, 'invalid');
    });
  });

  group('ProjectLimitExceededException', () {
    test('toString returns message', () {
      final exception = ProjectLimitExceededException('limit reached');
      expect(exception.toString(), 'limit reached');
      expect(exception.message, 'limit reached');
    });
  });

  group('ProjectService - removeMember for unknown project', () {
    test('throws for unknown project', () {
      expect(
        () => projectService.removeMember('unknown', 'user_1'),
        throwsA(isA<ProjectNotFoundException>()),
      );
    });
  });

  group('ProjectService - addMember for unknown project', () {
    test('throws for unknown project', () {
      expect(
        () => projectService.addMember(
          'unknown',
          'user_1',
          SubscriptionTier.free,
        ),
        throwsA(isA<ProjectNotFoundException>()),
      );
    });
  });
}
