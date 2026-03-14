import { graphFetch, isPlannerConfigured } from './planner-graph-client';

export interface PlannerGroup {
  id: string;
  displayName: string;
}

export interface PlannerPlan {
  id: string;
  title: string;
  owner: string;
  webUrl?: string;
}

export interface PlannerBucket {
  id: string;
  name: string;
  planId: string;
}

export interface PlannerTask {
  id: string;
  title: string;
  planId: string;
  bucketId: string;
  percentComplete: number;
  '@odata.etag'?: string;
}

export interface PlannerTaskDetails {
  id: string;
  description: string;
  '@odata.etag'?: string;
}

class PlannerService {
  isAppConfigured(): boolean {
    return isPlannerConfigured();
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isAppConfigured()) {
        return { success: false, message: 'Planner credentials not configured' };
      }
      await graphFetch('/groups?$top=1&$select=id');
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }

  async listMyGroups(): Promise<PlannerGroup[]> {
    const result = await graphFetch('/groups?$select=id,displayName&$top=100');
    return (result?.value || []).map((g: any) => ({
      id: g.id,
      displayName: g.displayName,
    }));
  }

  async getPlansForGroup(groupId: string): Promise<PlannerPlan[]> {
    const result = await graphFetch(`/groups/${groupId}/planner/plans?$select=id,title,owner`);
    return (result?.value || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      owner: p.owner,
      webUrl: `https://tasks.office.com/planner#/plantaskboard?groupId=${groupId}&planId=${p.id}`,
    }));
  }

  async getOrCreateBucket(planId: string, bucketName: string): Promise<PlannerBucket> {
    const result = await graphFetch(`/planner/plans/${planId}/buckets`);
    const buckets = result?.value || [];

    const existing = buckets.find((b: any) => b.name === bucketName);
    if (existing) {
      return { id: existing.id, name: existing.name, planId: existing.planId };
    }

    const created = await graphFetch('/planner/buckets', {
      method: 'POST',
      body: JSON.stringify({ name: bucketName, planId, orderHint: ' !' }),
    });

    return { id: created.id, name: created.name, planId: created.planId };
  }

  async createTask(options: { planId: string; bucketId: string; title: string }): Promise<PlannerTask> {
    const task = await graphFetch('/planner/tasks', {
      method: 'POST',
      body: JSON.stringify({
        planId: options.planId,
        bucketId: options.bucketId,
        title: options.title,
      }),
    });

    return {
      id: task.id,
      title: task.title,
      planId: task.planId,
      bucketId: task.bucketId,
      percentComplete: task.percentComplete || 0,
      '@odata.etag': task['@odata.etag'],
    };
  }

  async getTaskDetails(taskId: string): Promise<PlannerTaskDetails> {
    const details = await graphFetch(`/planner/tasks/${taskId}/details`);
    return {
      id: details.id,
      description: details.description || '',
      '@odata.etag': details['@odata.etag'],
    };
  }

  async updateTaskDetails(taskId: string, etag: string, description: string): Promise<void> {
    await graphFetch(`/planner/tasks/${taskId}/details`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: JSON.stringify({ description }),
    });
  }

  async getTaskWithDetails(taskId: string): Promise<PlannerTask & { description: string }> {
    const [task, details] = await Promise.all([
      graphFetch(`/planner/tasks/${taskId}`),
      this.getTaskDetails(taskId),
    ]);

    return {
      id: task.id,
      title: task.title,
      planId: task.planId,
      bucketId: task.bucketId,
      percentComplete: task.percentComplete || 0,
      '@odata.etag': task['@odata.etag'],
      description: details.description,
    };
  }

  async updateTask(taskId: string, etag: string, updates: Partial<{ title: string; percentComplete: number }>): Promise<void> {
    await graphFetch(`/planner/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: JSON.stringify(updates),
    });
  }
}

export const plannerService = new PlannerService();
