import '../models/project_model.dart';
import '../models/user_model.dart';

class ProjectService {
  final Map<String, ProjectModel> _projects = {};
  int _idCounter = 0;

  List<ProjectModel> get allProjects => _projects.values.toList();

  ProjectModel? getProject(String id) => _projects[id];

  List<ProjectModel> getProjectsForUser(String userId) {
    return _projects.values
        .where((project) => project.isMember(userId))
        .toList();
  }

  List<ProjectModel> getActiveProjects() {
    return _projects.values
        .where((project) => project.status.isAccessible)
        .toList();
  }

  ProjectModel createProject({
    required String name,
    String? description,
    required String ownerId,
    required SubscriptionTier ownerTier,
  }) {
    final userProjects =
        getProjectsForUser(ownerId).where((p) => p.ownerId == ownerId).length;

    if (ownerTier.maxProjects != -1 &&
        userProjects >= ownerTier.maxProjects) {
      throw ProjectLimitExceededException(
        'Project limit reached for ${ownerTier.name} tier '
        '(max: ${ownerTier.maxProjects})',
      );
    }

    if (name.trim().isEmpty) {
      throw InvalidProjectException('Project name cannot be empty');
    }
    if (name.length > 100) {
      throw InvalidProjectException(
        'Project name cannot exceed 100 characters',
      );
    }

    final now = DateTime.now();
    _idCounter++;
    final project = ProjectModel(
      id: 'proj_${now.millisecondsSinceEpoch}_$_idCounter',
      name: name.trim(),
      description: description?.trim(),
      ownerId: ownerId,
      createdAt: now,
      updatedAt: now,
    );

    _projects[project.id] = project;
    return project;
  }

  ProjectModel updateProject(String projectId, {String? name, String? description}) {
    final project = _projects[projectId];
    if (project == null) {
      throw ProjectNotFoundException('Project $projectId not found');
    }

    if (name != null && name.trim().isEmpty) {
      throw InvalidProjectException('Project name cannot be empty');
    }

    final updated = project.copyWith(
      name: name?.trim(),
      description: description?.trim(),
      updatedAt: DateTime.now(),
    );

    _projects[projectId] = updated;
    return updated;
  }

  ProjectModel addMember(String projectId, String userId, SubscriptionTier ownerTier) {
    final project = _projects[projectId];
    if (project == null) {
      throw ProjectNotFoundException('Project $projectId not found');
    }

    if (project.isMember(userId)) {
      throw InvalidProjectException('User is already a member');
    }

    if (ownerTier.maxTeamMembers != -1 &&
        project.totalMembers >= ownerTier.maxTeamMembers) {
      throw ProjectLimitExceededException(
        'Team member limit reached for ${ownerTier.name} tier '
        '(max: ${ownerTier.maxTeamMembers})',
      );
    }

    final updated = project.copyWith(
      memberIds: [...project.memberIds, userId],
      updatedAt: DateTime.now(),
    );

    _projects[projectId] = updated;
    return updated;
  }

  ProjectModel removeMember(String projectId, String userId) {
    final project = _projects[projectId];
    if (project == null) {
      throw ProjectNotFoundException('Project $projectId not found');
    }

    if (project.ownerId == userId) {
      throw InvalidProjectException('Cannot remove the project owner');
    }

    if (!project.memberIds.contains(userId)) {
      throw InvalidProjectException('User is not a member');
    }

    final updated = project.copyWith(
      memberIds: project.memberIds.where((id) => id != userId).toList(),
      updatedAt: DateTime.now(),
    );

    _projects[projectId] = updated;
    return updated;
  }

  ProjectModel archiveProject(String projectId) {
    final project = _projects[projectId];
    if (project == null) {
      throw ProjectNotFoundException('Project $projectId not found');
    }

    final updated = project.copyWith(
      status: ProjectStatus.archived,
      updatedAt: DateTime.now(),
    );

    _projects[projectId] = updated;
    return updated;
  }

  bool deleteProject(String projectId) {
    return _projects.remove(projectId) != null;
  }

  List<ProjectModel> searchProjects(String query) {
    final lowerQuery = query.toLowerCase();
    return _projects.values.where((project) {
      return project.name.toLowerCase().contains(lowerQuery) ||
          (project.description?.toLowerCase().contains(lowerQuery) ?? false);
    }).toList();
  }
}

class ProjectNotFoundException implements Exception {
  final String message;
  ProjectNotFoundException(this.message);
  @override
  String toString() => message;
}

class InvalidProjectException implements Exception {
  final String message;
  InvalidProjectException(this.message);
  @override
  String toString() => message;
}

class ProjectLimitExceededException implements Exception {
  final String message;
  ProjectLimitExceededException(this.message);
  @override
  String toString() => message;
}
