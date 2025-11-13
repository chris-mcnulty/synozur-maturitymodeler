/**
 * Migration script to update user roles from legacy format to new tenant-scoped roles
 * 
 * Changes:
 * - 'admin' → 'global_admin'
 * - 'modeler' → 'user' (requires manual upgrade if they need elevated access)
 * - 'user' → 'user' (no change)
 */

import { db } from '../db';
import { users } from '@shared/schema';
import { eq, or } from 'drizzle-orm';
import { USER_ROLES } from '@shared/constants';

export async function migrateUserRoles() {
  console.log('Starting user role migration...');
  
  try {
    // Update all 'admin' users to 'global_admin'
    const adminResult = await db
      .update(users)
      .set({ role: USER_ROLES.GLOBAL_ADMIN })
      .where(eq(users.role, 'admin'))
      .returning({ id: users.id, username: users.username });
    
    console.log(`✓ Updated ${adminResult.length} admin users to global_admin:`);
    adminResult.forEach(u => console.log(`  - ${u.username} (${u.id})`));
    
    // Update all 'modeler' users to 'user' (they can be manually upgraded later)
    const modelerResult = await db
      .update(users)
      .set({ role: USER_ROLES.USER })
      .where(eq(users.role, 'modeler'))
      .returning({ id: users.id, username: users.username });
    
    console.log(`✓ Updated ${modelerResult.length} modeler users to user (manual upgrade required if needed):`);
    modelerResult.forEach(u => console.log(`  - ${u.username} (${u.id})`));
    
    // Verify no legacy roles remain
    const legacyRoles = await db
      .select()
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'modeler')));
    
    if (legacyRoles.length > 0) {
      console.error(`⚠ Warning: ${legacyRoles.length} users still have legacy roles!`);
      legacyRoles.forEach(u => console.error(`  - ${u.username}: ${u.role}`));
      throw new Error('Migration incomplete - legacy roles still exist');
    }
    
    // Summary
    const roleCounts = await db
      .select({
        role: users.role,
      })
      .from(users);
    
    const summary: Record<string, number> = {};
    roleCounts.forEach(r => {
      summary[r.role] = (summary[r.role] || 0) + 1;
    });
    
    console.log('\n✓ Migration complete! Current role distribution:');
    Object.entries(summary).forEach(([role, count]) => {
      console.log(`  ${role}: ${count} users`);
    });
    
  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateUserRoles()
    .then(() => {
      console.log('\n✓ Role migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Role migration failed:', error);
      process.exit(1);
    });
}
