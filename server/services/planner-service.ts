import { graphFetch, getGlobalCredentials, type PlannerCredentials } from './planner-graph-client';

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

export interface TenantPlannerConfig {
  supportPlannerTenantId?: string | null;
  supportPlannerClientId?: string | null;
  supportPlannerClientSecret?: string | null;
}

export function resolvePlannerCredentials(tenant?: TenantPlannerConfig | null): PlannerCredentials | null {
  if (tenant?.supportPlannerTenantId && tenant?.supportPlannerClientId && tenant?.supportPlannerClientSecret) {
    return {
      tenantId: tenant.supportPlannerTenantId,
      clientId: tenant.supportPlannerClientId,
      clientSecret: tenant.supportPlannerClientSecret,
    };
  }
  return getGlobalCredentials();
}

class PlannerService {
  isConfigured(tenant?: TenantPlannerConfig | null): boolean {
    return !!resolvePlannerCredentials(tenant);
  }

  private requireCreds(tenant?: TenantPlannerConfig | null): PlannerCredentials {
    const creds = resolvePlannerCredentials(tenant);
    if (!creds) throw new Error('Planner credentials not configured');
    return creds;
  }

  async testConnection(tenant?: TenantPlannerConfig | null): Promise<{ success: boolean; message: string }> {
    try {
      const creds = resolvePlannerCredentials(tenant);
      if (!creds) {
        return { success: false, message: 'Planner credentials not configured. Set per-tenant credentials or global PLANNER_TENANT_ID, PLANNER_CLIENT_ID, PLANNER_CLIENT_SECRET.' };
      }
      await graphFetch('/groups?$top=1&$select=id', creds);
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }

  async listMyGroups(tenant?: TenantPlannerConfig | null): Promise<PlannerGroup[]> {
    const creds = this.requireCreds(tenant);
    const result = await graphFetch('/groups?$select=id,displayName&$top=100', creds);
    return (result?.value || []).map((g: any) => ({
      id: g.id,
      displayName: g.displayName,
    }));
  }

  async getPlansForGroup(groupId: string, tenant?: TenantPlannerConfig | null): Promise<PlannerPlan[]> {
    const creds = this.requireCreds(tenant);
    const result = await graphFetch(`/groups/${groupId}/planner/plans?$select=id,title,owner`, creds);
    return (result?.value || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      owner: p.owner,
      webUrl: `https://tasks.office.com/planner#/plantaskboard?groupId=${groupId}&planId=${p.id}`,
    }));
  }

  async getOrCreateBucket(planId: string, bucketName: string, tenant?: TenantPlannerConfig | null): Promise<PlannerBucket> {
    const creds = this.requireCreds(tenant);
    const result = await graphFetch(`/planner/plans/${planId}/buckets`, creds);
    const buckets = result?.value || [];

    const existing = buckets.find((b: any) => b.name === bucketName);
    if (existing) {
      return { id: existing.id, name: existing.name, planId: existing.planId };
    }

    const created = await graphFetch('/planner/buckets', creds, {
      method: 'POST',
      body: JSON.stringify({ name: bucketName, planId, orderHint: ' !' }),
    });

    return { id: created.id, name: created.name, planId: created.planId };
  }

  async createTask(options: { planId: string; bucketId: string; title: string }, tenant?: TenantPlannerConfig | null): Promise<PlannerTask> {
    const creds = this.requireCreds(tenant);
    const task = await graphFetch('/planner/tasks', creds, {
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

  async getTaskDetails(taskId: string, tenant?: TenantPlannerConfig | null): Promise<PlannerTaskDetails> {
    const creds = this.requireCreds(tenant);
    const details = await graphFetch(`/planner/tasks/${taskId}/details`, creds);
    return {
      id: details.id,
      description: details.description || '',
      '@odata.etag': details['@odata.etag'],
    };
  }

  async updateTaskDetails(taskId: string, etag: string, description: string, tenant?: TenantPlannerConfig | null): Promise<void> {
    const creds = this.requireCreds(tenant);
    await graphFetch(`/planner/tasks/${taskId}/details`, creds, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: JSON.stringify({ description }),
    });
  }

  async getTaskWithDetails(taskId: string, tenant?: TenantPlannerConfig | null): Promise<PlannerTask & { description: string }> {
    const creds = this.requireCreds(tenant);
    const [task, details] = await Promise.all([
      graphFetch(`/planner/tasks/${taskId}`, creds),
      this.getTaskDetails(taskId, tenant),
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

  async updateTask(taskId: string, etag: string, updates: Partial<{ title: string; percentComplete: number }>, tenant?: TenantPlannerConfig | null): Promise<void> {
    const creds = this.requireCreds(tenant);
    await graphFetch(`/planner/tasks/${taskId}`, creds, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: JSON.stringify(updates),
    });
  }
}

export const plannerService = new PlannerService();
