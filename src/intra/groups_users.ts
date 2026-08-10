import Fast42 from '@codam/fast42';
import { syncDataCB } from './base';
import { prisma } from "../handlers/db";

export const syncGroupsUsers = async function(api: Fast42, syncDate: Date): Promise<void> {
	const groups = await prisma.group.findMany({});

	for (const group of groups) {
		await syncDataCB(api, syncDate, undefined, `/groups/${group.id}/groups_users`, {}, async (groupsUsers) => {
			// Delete all group_users
			await prisma.groupUser.deleteMany({});

			for (const groupUser of groupsUsers) {
				console.debug(`Syncing a group_user (user ${groupUser.user_id} in group "${groupUser.group.name}")...`);

				try {
					const user = await prisma.user.findFirst({
						where: {
							id: groupUser.user_id,
						},
						select: {
							id: true, // Minimal select to check if user exists
						},
					});
					if (!user) {
						continue; // User is likely not from our campus
					}

					await prisma.groupUser.upsert({
						where: {
							id: groupUser.id,
						},
						update: {
							user_id: groupUser.user_id,
						},
						create: {
							id: groupUser.id,
							user: {
								connect: {
									id: groupUser.user_id,
								},
							},
							group: {
								connect: {
									id: groupUser.group.id,
								},
							},
						}
					});
				}
				catch (err) {
					console.error(`Error syncing group_user ${groupUser.id}: ${err}`);
				}
			}
		});
	}

	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			type: 'groups_users',
		},
		update: {
			last_sync_date: syncDate,
		},
		create: {
			type: 'groups_users',
			last_sync_date: syncDate,
		},
	});
};
