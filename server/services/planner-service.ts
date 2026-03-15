import { graphFetch, isSsoAppConfigured } from './planner-graph-client';

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
  canConnect(ssoTenantId?: string | null): boolean {
    return isSsoAppConfigured() && !!ssoTenantId;
  }

  private requireTenantId(ssoTenantId?: string | null): string {
    if (!isSsoAppConfigured()) throw new Error('Azure SSO app not configured (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET required)');
    if (!ssoTenantId) throw new Error('Tenant has no Azure AD tenant ID configured. Users must sign in via SSO first, or an admin must grant consent.');
    return ssoTenantId;
  }

  async testConnection(ssoTenantId?: string | null): Promise<{ success: boolean; message: string }> {
    try {
      const tid = this.requireTenantId(ssoTenantId);
      await graphFetch('/groups?$top=1&$select=id', tid);
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }

  async listMyGroups(ssoTenantId: string): Promise<PlannerGroup[]> {
    const result = await graphFetch('/groups?$select=id,displayName&$top=100', ssoTenantId);
    return (result?.value || []).map((g: any) => ({
      id: g.id,
      displayName: g.displayName,
    }));
  }

  async getPlansForGroup(groupId: string, ssoTenantId: string): Promise<PlannerPlan[]> {
    const result = await graphFetch(`/groups/${groupId}/planner/plans?$select=id,title,owner`, ssoTenantId);
    return (result?.value || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      owner: p.owner,
      webUrl: `https://tasks.office.com/planner#/plantaskboard?groupId=${groupId}&planId=${p.id}`,
    }));
  }

  async getOrCreateBucket(planId: string, bucketName: string, ssoTenantId: string): Promise<PlannerBucket> {
    const result = await graphFetch(`/planner/plans/${planId}/buckets`, ssoTenantId);
    const buckets = result?.value || [];

    const existing = buckets.find((b: any) => b.name === bucketName);
    if (existing) {
      return { id: existing.id, name: existing.name, planId: existing.planId };
    }

    const created = await graphFetch('/planner/buckets', ssoTenantId, {
      method: 'POST',
      body: JSON.stringify({ name: bucketName, planId, orderHint: ' !' }),
    });

    return { id: created.id, name: created.name, planId: created.planId };
  }

  async createTask(options: { planId: string; bucketId: string; title: string }, ssoTenantId: string): Promise<PlannerTask> {
    const task = await graphFetch('/planner/tasks', ssoTenantId, {
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

  async getTaskDetails(taskId: string, ssoTenantId: string): Promise<PlannerTaskDetails> {
    const details = await graphFetch(`/planner/tasks/${taskId}/details`, ssoTenantId);
    return {
      id: details.id,
      description: details.description || '',
      '@odata.etag': details['@odata.etag'],
    };
  }

  async updateTaskDetails(taskId: string, etag: string, description: string, ssoTenantId: string): Promise<void> {
    await graphFetch(`/planner/tasks/${taskId}/details`, ssoTenantId, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: JSON.stringify({ description }),
    });
  }

  async getTaskWithDetails(taskId: string, ssoTenantId: string): Promise<PlannerTask & { description: string }> {
    const [task, details] = await Promise.all([
      graphFetch(`/planner/tasks/${taskId}`, ssoTenantId),
      this.getTaskDetails(taskId, ssoTenantId),
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

  async updateTask(taskId: string, etag: string, updates: Partial<{ title: string; percentComplete: number }>, ssoTenantId: string): Promise<void> {
    await graphFetch(`/planner/tasks/${taskId}`, ssoTenantId, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: JSON.stringify(updates),
    });
  }
}

export const plannerService = new PlannerService();
