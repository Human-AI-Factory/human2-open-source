import type { PageResult, Project, Task, TaskPriority, TaskStatus } from '../../core/types.js';
import { attachTasks, mapTask } from '../sqlite/row-mappers.js';
import type { ProjectRow, SortOrder, SummaryRow, TaskRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class ProjectRepository extends BaseRepository {
  listProjects(): Project[] {
    const projectRows = this.db
      .prepare('SELECT id, name, description, created_at, updated_at FROM projects ORDER BY created_at DESC')
      .all() as ProjectRow[];

    if (projectRows.length === 0) {
      return [];
    }

    const taskRows = this.db
      .prepare('SELECT id, project_id, title, status, priority, due_at, created_at, updated_at FROM tasks ORDER BY created_at DESC')
      .all() as TaskRow[];

    return attachTasks(projectRows, taskRows);
  }

  listProjectsPaged(input: {
    q?: string;
    page: number;
    pageSize: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'name';
    order?: SortOrder;
  }): PageResult<Project> {
    const keyword = input.q?.trim();
    const offset = (input.page - 1) * input.pageSize;
    const projectSortColumn = this.mapProjectSortBy(input.sortBy);
    const sortOrder = this.mapOrder(input.order);

    const whereClause = keyword ? 'WHERE p.name LIKE ? OR p.description LIKE ?' : '';
    const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM projects p ${whereClause}`)
      .get(...params) as { count: number };

    const projectRows = this.db
      .prepare(
        `SELECT p.id, p.name, p.description, p.created_at, p.updated_at FROM projects p ${whereClause} ORDER BY ${projectSortColumn} ${sortOrder} LIMIT ? OFFSET ?`
      )
      .all(...params, input.pageSize, offset) as ProjectRow[];

    if (projectRows.length === 0) {
      return {
        items: [],
        total: totalRow.count,
        page: input.page,
        pageSize: input.pageSize,
      };
    }

    const ids = projectRows.map((item) => item.id);
    const placeholder = ids.map(() => '?').join(',');
    const taskRows = this.db
      .prepare(
        `SELECT id, project_id, title, status, priority, due_at, created_at, updated_at FROM tasks WHERE project_id IN (${placeholder}) ORDER BY created_at DESC`
      )
      .all(...ids) as TaskRow[];

    return {
      items: attachTasks(projectRows, taskRows),
      total: totalRow.count,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  getProjectById(projectId: string): Project | null {
    const project = this.db
      .prepare('SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ? LIMIT 1')
      .get(projectId) as ProjectRow | undefined;

    if (!project) {
      return null;
    }

    const tasks = this.db
      .prepare('SELECT id, project_id, title, status, priority, due_at, created_at, updated_at FROM tasks WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as TaskRow[];

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      tasks: tasks.map((task) => mapTask(task)),
    };
  }

  listProjectTasks(
    projectId: string,
    input: {
      q?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      page: number;
      pageSize: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'status' | 'priority' | 'dueAt';
      order?: SortOrder;
    }
  ): PageResult<Task> | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const keyword = input.q?.trim();
    const offset = (input.page - 1) * input.pageSize;
    const taskSortColumn = this.mapTaskSortBy(input.sortBy);
    const sortOrder = this.mapOrder(input.order);
    const whereParts: string[] = ['project_id = ?'];
    const params: string[] = [projectId];

    if (keyword) {
      whereParts.push('title LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (input.status) {
      whereParts.push('status = ?');
      params.push(input.status);
    }
    if (input.priority) {
      whereParts.push('priority = ?');
      params.push(input.priority);
    }
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM tasks ${whereClause}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT id, project_id, title, status, priority, due_at, created_at, updated_at FROM tasks ${whereClause} ORDER BY ${taskSortColumn} ${sortOrder} LIMIT ? OFFSET ?`
      )
      .all(...params, input.pageSize, offset) as TaskRow[];

    return {
      items: rows.map((row) => mapTask(row)),
      total: totalRow.count,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  createProject(input: { id: string; name: string; description: string; createdAt: string; updatedAt: string }): void {
    this.db
      .prepare('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(input.id, input.name, input.description, input.createdAt, input.updatedAt);
  }

  updateProject(projectId: string, input: { name?: string; description?: string }): boolean {
    const current = this.db
      .prepare('SELECT id, name, description FROM projects WHERE id = ? LIMIT 1')
      .get(projectId) as { id: string; name: string; description: string } | undefined;

    if (!current) {
      return false;
    }

    const name = input.name ?? current.name;
    const description = input.description ?? current.description;

    this.db
      .prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(name, description, this.timestamp(), projectId);

    return true;
  }

  deleteProject(projectId: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    return Number(result.changes) > 0;
  }

  createTask(input: {
    id: string;
    projectId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt: string | null;
    createdAt: string;
    updatedAt: string;
  }): boolean {
    if (!this.projectExists(input.projectId)) {
      return false;
    }

    this.db
      .prepare(
        'INSERT INTO tasks (id, project_id, title, status, priority, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(input.id, input.projectId, input.title, input.status, input.priority, input.dueAt, input.createdAt, input.updatedAt);

    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(this.timestamp(), input.projectId);
    return true;
  }

  updateTask(
    projectId: string,
    taskId: string,
    input: { title?: string; status?: TaskStatus; priority?: TaskPriority; dueAt?: string | null }
  ): boolean {
    const current = this.db
      .prepare('SELECT id, project_id, title, status, priority, due_at FROM tasks WHERE id = ? AND project_id = ? LIMIT 1')
      .get(taskId, projectId) as
      | { id: string; project_id: string; title: string; status: TaskStatus; priority: TaskPriority; due_at: string | null }
      | undefined;

    if (!current) {
      return false;
    }

    const title = input.title ?? current.title;
    const status = input.status ?? current.status;
    const priority = input.priority ?? current.priority;
    const dueAt = input.dueAt === undefined ? current.due_at : input.dueAt;

    this.db
      .prepare('UPDATE tasks SET title = ?, status = ?, priority = ?, due_at = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(title, status, priority, dueAt, this.timestamp(), taskId, projectId);

    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(this.timestamp(), projectId);
    return true;
  }

  deleteTask(projectId: string, taskId: string): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(taskId, projectId);
    if (Number(result.changes) === 0) {
      return false;
    }

    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(this.timestamp(), projectId);
    return true;
  }

  getSummary(): { projectCount: number; taskCount: number; doneCount: number; doingCount: number } {
    const row = this.db
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM projects) AS project_count,
          (SELECT COUNT(*) FROM tasks) AS task_count,
          (SELECT COUNT(*) FROM tasks WHERE status = 'done') AS done_count,
          (SELECT COUNT(*) FROM tasks WHERE status = 'doing') AS doing_count
      `
      )
      .get() as SummaryRow;

    return {
      projectCount: row.project_count,
      taskCount: row.task_count,
      doneCount: row.done_count,
      doingCount: row.doing_count,
    };
  }

  private mapProjectSortBy(sortBy?: 'createdAt' | 'updatedAt' | 'name'): string {
    switch (sortBy) {
      case 'name':
        return 'p.name';
      case 'updatedAt':
        return 'p.updated_at';
      case 'createdAt':
      default:
        return 'p.created_at';
    }
  }

  private mapTaskSortBy(sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'status' | 'priority' | 'dueAt'): string {
    switch (sortBy) {
      case 'dueAt':
        return 'due_at';
      case 'priority':
        return 'priority';
      case 'title':
        return 'title';
      case 'status':
        return 'status';
      case 'updatedAt':
        return 'updated_at';
      case 'createdAt':
      default:
        return 'created_at';
    }
  }
}
